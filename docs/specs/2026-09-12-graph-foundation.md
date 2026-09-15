# Graph foundation: schema and client

This is the first part of migration phase 4. MongoDB still owns every application
subsystem. These modules are exercised by operator commands and CI; web, realtime,
and audio do not connect to Gremlin, receive database credentials, or install schema.

## Schema contract

`0001-foundation.groovy` installs SINGLE String keys and two unique composite vertex
indexes: `(scope, kind, entityId)` and `graphSchemaName`. Both use JanusGraph's LOCK
consistency modifier. Application IDs retain canonical lowercase 24-character Mongo
ObjectId strings; internal JanusGraph IDs are not application identifiers. Scopes are
`campaign:<id>`, `user:<id>`, or `global`. A scope is a data partitioning convention,
**not authorization**. Membership, GM visibility, and relationship permissions must
be enforced by the future domain repositories.

Only `GraphSchema`, `GraphFoundationProbe`, and the probe edge
`GRAPH_FOUNDATION_LINK` are declared. Domain labels, relationship types, fields,
search indexes, and repository contracts arrive with their audited subsystem slices.
The probe edge has SIMPLE multiplicity. No NPC, user, or campaign records are imported.

The migrator checks property types/cardinality, labels, edge multiplicity, index
shape/uniqueness/locking, and ENABLED status. It rejects missing/drifted schema in
verify mode. Apply checks the existing version/checksum before committing changes.
A SHA-256 of the exact migration file is persisted as the completion record. Never
edit or downgrade a released migration; add an explicit next migration.

New index keys are created in the same management transaction as their indexes.
If keys already exist without the index, apply refuses: an explicit reindex procedure
is required, not blind enabling that hides old data. If a committed schema has no
completion record after interruption, reapplying validates it and records completion.
If index status is not ENABLED, investigate lifecycle/registration before retrying.
See [JanusGraph's index lifecycle](https://docs.janusgraph.org/schema/index-management/index-lifecycle/).

The complete script is serialized on the server's graph object, and requires exactly
one registered graph instance. This is deliberately limited to the deployed single
JanusGraph server. A distributed schema lease/fencing mechanism is required before
increasing replicas. It does not coordinate unrelated ad hoc administrator scripts;
run one designated operator job and keep other schema writers stopped. Stale instance
registrations cause a refusal. Verify the actual Docker processes/k8s pods and prove
an instance is stopped before using JanusGraph management's `forceCloseInstance`;
the tool never automatically evicts another instance.

## Connection behavior

`app/server/db/graph/client.ts` accepts Gremlin bytecode. Fixed administrator scripts
live under `scripts/graph`; all variable script values use bindings. There is no
browser Gremlin endpoint or interpolated user script. TLS certificate/hostname checks
are mandatory in the environment loader; credentials and CA come from server files.
The driver is pinned to Gremlin 3.7.6, matching the deployed server's GraphSON 3 protocol.
Gremlin's UUID dependency uses the same maintained 11.1.1 override as infrastructure.
The older DefinitelyTyped package covers the APIs used; real protocol tests cover the
GraphSON traverser shape missing from its declarations.

Each operation owns one connection, a server evaluation timeout, an absolute client
socket deadline, and an optional AbortSignal. A new operation reconnects, but no failed
operation is automatically replayed. A timeout/disconnect can leave a write committed:
repositories must reconcile by application identity/operation state before retrying.
Cancellation is not proof of rollback. Errors expose no driver response, script,
credentials, or private content. Operators can inspect protected server logs when a
schema check fails.

The transport expands GraphSON traverser bulk with a 1,000-item output cap. Callers
must still bound traversals/projections: the driver buffers responses, so this cap is
not a wire-size/memory guarantee. Repository pagination, nested value codecs, pool/load
limits, and domain authorization are still phase-4 work. JanusGraph uniqueness locking
does not replace Mongo transaction isolation or Cassandra LWT state invariants; see
[JanusGraph's consistency limits](https://docs.janusgraph.org/advanced-topics/eventual-consistency/).

## Run locally

From the app checkout, after `npm ci` and with the sibling infrastructure checkout:

```sh
npm run db:up
export GREMLIN_URL=wss://localhost:18182/gremlin
export GREMLIN_USERNAME=cartyx_admin
export GREMLIN_PASSWORD_FILE=/absolute/path/to/cartyx-infrastructure/.local/data/local/gremlin-password
export GREMLIN_CA_FILE=/absolute/path/to/cartyx-infrastructure/.local/data/local/tls.crt
npm run graph:schema -- apply
npm run graph:schema -- verify
npm run graph:test
```

These commands read exported shell settings; they do not implicitly load `.env` or
choose an environment. `GREMLIN_TIMEOUT_MS` defaults to 10,000 and permits 100–15,000.
The production/operator password must never be mounted into application containers.
Runtime authentication/authorization separation is a gate before any application
consumer is connected; the existing infrastructure endpoint is administrator-only.
The [request-isolation prerequisite](2026-09-14-gremlin-authorization-prerequisite.md)
records the handler fix in infrastructure PR #14, its publication and verified dev
rollout through PR #15. Application CI pins that promoted infrastructure revision.

`graph:test` requires an installed schema and uses isolated, randomly generated probe
identities. It checks repeated/concurrent apply, checksum rejection, scoped lookups,
bytecode text handling/CRUD/edges, concurrent uniqueness, rollback, rejected scans,
TLS/authentication failures, and a successful request after failures. Cleanup attempts
every generated identity. If interrupted or cleanup fails, `.local/graph-runs/*.json`
retains exact fixture identities and endpoint for targeted cleanup; never run a broad
entity deletion. These manifests contain synthetic IDs, not database credentials.

CI checks out infrastructure commit `662977641ac0cb80c6c328c26baf2e12a33b3c67`, runs
its digest-pinned Docker services, proves verify fails on an empty graph, applies
schema, runs the contracts, restarts JanusGraph, and repeats verification/contracts.
Infrastructure definitions stay in their own repository.

## Kubernetes rollout and next gates

Use an explicit kubeconfig and namespace, never the current context implicitly:

```sh
kubectl --kubeconfig /absolute/path/to/cartyx.yaml -n dev \
  port-forward svc/cartyx-data-janusgraph 28182:8182 --address 127.0.0.1
```

In another shell, export `GREMLIN_URL=wss://localhost:28182/gremlin` and the **dev**
CA/password file paths, then run apply, verify, and graph:test as above. This is an
operator rehearsal using kubectl authorization, not an application rollout or a
substitute for the existing in-cluster NetworkPolicy checks.

September 12 validation: schema 0001 and the real protocol contracts passed on local
Docker (ARM64) and Kubernetes dev (AMD64), using the existing hardened image digests.
Schema SHA-256: `bbde8104d97f9cb79d224fc0505b6f4417a50e35e3a0eff8f35586be6002fdf7`.
Production schema/application settings are unchanged in this slice.

Before any domain cutover, finish runtime credential/authorization enforcement,
application-owned CQL clients/schema/conditional-state contracts, migration manifests,
collection/field/constraint inventory, search deployment/parity, and authorization,
pagination, load and failure-recovery repository contracts. Then identity/access is
the first subsystem, followed by campaigns and membership. This PR does not mark all
of phase 4 complete. Promote the reviewed schema/code through dev before applying
the corresponding production migration; never install schema on web startup.
