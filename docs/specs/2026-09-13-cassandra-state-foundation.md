# Cassandra state foundation

Application migration work is now consolidated in PR #557 against `dev`; #556 is
superseded. Continue adding application changes to that branch. Infrastructure
already merged in its own repository remains there. MongoDB still owns every
application subsystem. These clients are exercised by operator tooling and tests,
without adding Cassandra credentials to web, realtime, or audio deployments.

## Storage and consistency

The first application-owned CQL table is `control_state`, with one row per complete
partition key `(scope, resource_type, resource_id)`. Scope is `global`,
`campaign:<ObjectId>`, or `user:<ObjectId>`. Type/ID lengths are bounded. A row contains
an opaque UUID v4 revision and a versioned JSON operational payload of at most 16 KiB
(also bounded to 4,096 nodes and depth 32). Payloads must be plain, lossless JSON;
dates, undefined, non-finite numbers, getters, custom prototypes, and cycles are
rejected. Domain repositories must separately validate their payload schemas and
authorize access. Graph relationships do not belong in these payloads.

`create` uses `IF NOT EXISTS`; `replace` requires the expected revision and a fresh
next revision. The caller generates and retains the next revision **before** sending
the mutation. `true` means the conditional mutation applied; `false` means the
condition did not match. Four concurrent replacements of one revision must produce
one winner. Returning to an earlier payload does not make its old revision valid.
Never reuse a previous revision for a new operation.

Writes use LOCAL_QUORUM with LOCAL_SERIAL for the Paxos phase. Point reads use
LOCAL_SERIAL to resolve pending conditional writes when reconciling an uncertain
outcome. There are no automatic statement retries, speculative executions, batches,
TTL expiry, unconditional application upserts, or cross-partition operations.
A failed/timed-out mutation may have committed. Read the record: if its revision
matches the retained proposed revision, that state is present. A different revision
cannot prove whether an earlier operation committed and was later superseded; domain
operation journals must handle that ambiguity where historical exactly-once behavior
is required. This primitive is not a complete job lease, reservation recovery system,
monotonic worker fence, or transaction spanning graph and CQL.

These choices follow Cassandra's [conditional DML semantics](https://cassandra.apache.org/doc/4.0/cassandra/cql/dml.html)
and the driver's [query consistency and idempotence options](https://docs.datastax.com/en/developer/nodejs-driver/4.8/api/type.QueryOptions/index.html).
The installed Apache driver is pinned to `cassandra-driver` 4.9.0; its shipped source
and real tests establish the exact behavior used here. `adm-zip` is overridden to
0.6.1 to remove its inherited advisories; cloud ZIP credential bundles are not an
accepted configuration path in these tools. The root production dependency audit
passes. Connection and per-coordinator request timeouts default to 10 seconds;
these are driver timeouts, not an end-to-end operation deadline or rollback guarantee.
TLS CA and hostname verification are explicitly enabled (including a required TLS
server name). Errors omit underlying query/credential/server error details.

## Administrative journal and migration recovery

The runtime role `cartyx_state` has SELECT/MODIFY on its state keyspace and no DDL
permission. Because Cassandra keyspace grants are inherited by its tables, keeping
a migration lock in that same keyspace would allow runtime modification. The
operator therefore creates a separate metadata keyspace:

| Environment               | Runtime state       | Admin-only schema journal |
| ------------------------- | ------------------- | ------------------------- |
| Local                     | `cartyx_state`      | `cartyx_schema`           |
| Dev                       | `cartyx_dev_state`  | `cartyx_dev_schema`       |
| Production, when promoted | `cartyx_prod_state` | `cartyx_prod_schema`      |

The `cartyx_admin` role alone manages `schema_migrations`. Runtime SELECT and INSERT
against that journal are both tested to fail, as are runtime DDL and graph-table
access. Application code never modifies JanusGraph tables. The infrastructure
bootstrap does not grant permissions on these new metadata keyspaces, so a repeated
bootstrap cannot grant runtime access to them. Both keyspaces are checked for durable
writes and the current single-datacenter RF1 layout. Change topology through an
explicit migration rather than relaxing this guard or pretending RF1 is HA.

Apply takes an owner UUID recorded durably in `CQL_MIGRATION_OWNER`. An LWT inserts
the version/checksum/owner in `installing` state. The installer creates the table,
validates column types, partition-key positions, and disabled TTL, then conditionally
records completion. A second owner cannot take over an unfinished installation.
After proving the original job stopped, resume with its **same owner UUID**. There
is no expiring lock that lets an old worker continue after another owner takes over.
Operators must not run two jobs using the same owner simultaneously. An installation
already marked complete is verified on repeat apply, without recreating a missing
state table and masking data loss. Changed checksums/versions or table drift fail.

The definition checksum for schema 0001 is
`048e0ed18d94afe3f583e88af03239e18455e63e649f89723071c3a55bd4d46e`.
This first migrator deliberately supports only 0001; later schema changes need an
explicit next-version transition and compatibility tests. Never edit the released
DDL definitions or manually mark an unfinished installation complete.

Infrastructure's cold backups archive the entire Cassandra data volume, including
system schema and these administrative keyspaces. Include state/journal reconciliation
in the next application-data restore rehearsal before any domain cutover; the existing
infrastructure-only recovery results do not measure a real campaign workload.

## Local and Kubernetes operations

With a working supported Node version and the existing local stack:

```sh
npm run db:up
npm run cql:local -- schema apply
npm run cql:local -- schema verify
npm run cql:local -- test
```

The helper uses the running Cassandra image to start a temporary TCP relay on the
stack's Docker network, publishing a random loopback-only port. It forwards encrypted
CQL without mounting credentials or terminating TLS. Credential files remain on the
host. The relay is removed after the command; no permanent CQL port or infrastructure
Compose duplication is added. A hard-killed helper may leave a container named
`cartyx-cql-proxy-<UUID>`; inspect and remove that exact abandoned helper container.
The local schema owner is retained in `.local/cql/local-schema-owner`.

For dev, start an explicitly targeted forward:

```sh
kubectl --kubeconfig /absolute/path/to/cartyx.yaml -n dev \
  port-forward svc/cartyx-data-cassandra 29042:9042 --address 127.0.0.1
```

In another shell, export `CQL_CONTACT_POINT=127.0.0.1`, `CQL_PORT=29042`,
`CQL_TLS_SERVER_NAME=localhost`, `CQL_DATACENTER=dc1`, and
`CQL_STATE_KEYSPACE=cartyx_dev_state`. Set `CQL_CA_FILE`, `CQL_PASSWORD_FILE`, and
`CQL_ADMIN_PASSWORD_FILE` to the dev `tls.crt`, `cassandra-state-password`, and
`cassandra-admin-password` files. Persist an owner UUID in a private operator job
record before exporting `CQL_MIGRATION_OWNER`. Then run:

```sh
npm run cql:schema -- apply
npm run cql:schema -- verify
npm run cql:test
```

No CLI implicitly chooses an environment or loads `.env`. Tests generate isolated
probe records and two scratch keyspaces, exercise interrupted migration/resume,
checksum/table drift, scoped state, concurrent CAS, stale revisions, replay
reconciliation, TLS/hostname/authentication, and runtime privilege denial. Cleanup
uses exact generated identifiers; an interrupted run retains its manifest under
`.local/cql/runs`. Never drop broad sets of keyspaces or rows to clean up a test.

CI runs these checks against the existing digest-pinned infrastructure checkout.
It saves a known revision/payload, stops JanusGraph, restarts Cassandra, restarts
JanusGraph after Cassandra is healthy, and verifies both schemas and the persisted
state witness before cleaning up. The witness commands are
`cql:local -- seed-persistence` and `cql:local -- verify-persistence`; their manifest
is `.local/cql/persistence.json`.

September 13 evidence: schema install/verify, real conditional-state contracts,
interrupted-journal recovery, drift refusal, runtime permission denial, and negative
TLS/hostname/authentication tests passed on local ARM64 Docker and Kubernetes dev
AMD64. Local checks used installed Node 24.21.0. Production schema is unchanged.
Graph runtime authorization separation, search, field/constraint inventory, and
per-domain operation/repository contracts remain before the first subsystem cutover.
