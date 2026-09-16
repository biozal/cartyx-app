# Gremlin authorization request isolation

The authorization-handler prerequisite and the constrained identity policy are
published and deployed to dev (infrastructure `ce0276059bb9112c67836049b2e53a5617003ceb`).
Dev JanusGraph now enforces the policy for the `cartyx_identity` service principal.
No application deployment has that credential yet, and target storage is not
selected. Administrator credentials must never be mounted into application
containers. Production still has only the operator account (`data-v0.1.1`).

The pinned TinkerPop 3.7.6 handlers retained a mutable authenticated principal in
shared instances. Overlapping WebSocket connections could authorize with another
connection's principal; HTTP denials could audit the wrong principal. The upstream
[request-isolation fix](https://github.com/apache/tinkerpop/commit/eae093bbfdbaf599fff0e44cb7250bf360dba706)
was backported in [infrastructure PR #14](https://github.com/biozal/cartyx-infrastructure/pull/14),
merged at `6aa15cb8fab913414ac9d778c31475e68761296b`.

The build also removes request content and Authorizer exception messages from
these handlers' denial responses/logs, releases malformed HTTP buffers, and locks
the JAR containing exactly two modified classes. Four superseded Ubuntu Python
pins advance to `3.12.3-1ubuntu0.17`; storage versions, schemas, credentials and
runtime permissions are unchanged.

## Publication and dev verification

[Publication run 34903874475](https://github.com/biozal/cartyx-infrastructure/actions/runs/34903874475)
built, scanned and tested both native architectures before publishing. Every build
reproduces the original races/disclosure, then verifies the fixed handlers with
Netty embedded channels. Tests cover restricted bytecode forwarding, anonymous
identity, denied scripts/bytecode, unexpected failures, content exclusion and HTTP
reference counts. Image CI additionally verifies TLS/authentication, persistence
and an independent-volume restore. This is not an end-to-end runtime permission
policy test.

Anonymous registry access verified both published indexes and matched their
amd64/arm64 manifests and config identities to the tested artifacts. Both scans
have zero unexcepted HIGH/CRITICAL findings; Cassandra retains its existing scoped
SnakeYAML exception.

[Infrastructure PR #15](https://github.com/biozal/cartyx-infrastructure/pull/15)
promotes the verified digests in Chart and Compose. Its exact-head infrastructure
[CI run](https://github.com/biozal/cartyx-infrastructure/actions/runs/34922497615)
passed. Dev follows the merged revision
`e9390ea392a08fa72cc557383d87e2e48a6d2c5a`, which is also pinned by application
Graph foundation CI. Both database resources became healthy on the original dev
volume after a fresh pre-upgrade backup.

Live dev graph/CQL, TLS/authentication, identity recovery and network isolation
contracts passed against the new images. A new backup passed full off-host checksum
verification; restoring it into an independent namespace/volume passed graph,
TLS/authentication and scoped CQL checks. Only that verified scratch namespace and
volume were removed. The source remained healthy on its original volume, and
synthetic test recovery manifests were cleared. Private backup keys and detailed
results are retained in the external migration handoff, not this repository.

Production remains on immutable tag `data-v0.1.1`. Running developer containers
were not restarted. No real source accounts were imported or backend activated.

## Constrained identity policy candidate — September 16

[Infrastructure PR #16](https://github.com/biozal/cartyx-infrastructure/pull/16)
packages an inactive policy candidate at `a78ec204ff01fd70157a040e02969d5d8bf54e24`.
It allows the identity service's six exact immutable profile traversal forms,
checks the complete request envelope and prevents fallback to an unconfigured
binary serializer. Its guarded GraphSON decoder rejects active/unknown typed
values before typed deserialization. Runtime scripts, direct mutation/deletion,
source instructions, mismatched ownership, aliases, processors and sessions fail
closed. The administrator remains an operator principal.

The Java 11 candidate passed 1,315 checks using all 126 checksum-matched runtime
libraries. Tests use real SASL/WebSocket requests against a temporary TinkerGraph
server, including concurrent operator/runtime connections, failure privacy and
unchanged graph contents after denials and revision retries. These tests do not
replace the real JanusGraph/CQL runtime integration and recovery gates.

`scripts/identity/export-profile-authorization.ts` captures synthetic requests from
the actual profile repository with the installed JavaScript GraphSON writer. The
new CI contract job compares them with the immutable infrastructure fixture. Its
policy checkout pin is separate from the deployed image/integration checkout pin;
this does not change application runtime, deployed images or graph credentials.

Native candidate image CI, review/publication, authenticated application tests
against real JanusGraph, configured-policy backup/restore rehearsal and runtime
secret provisioning remain required before activation. The service principal would
span users; application user/campaign authorization remains necessary. The policy
checks the digest format, while the repository verifies its content correspondence.

## Publication and dev activation — September 16

Infrastructure PR #16 was reviewed against the pinned TinkerPop 3.7.6 pipeline and
merged as `81859e4411b33b218854618a8e07db859c5a1ca7`. There were no blocking findings.
A non-blocking permessage-deflate resource question was recorded for any wider
exposure.
[Publication run 35130624204](https://github.com/biozal/cartyx-infrastructure/actions/runs/35130624204)
passed the 1,315 policy assertions, scans and recovery on both native architectures.
Anonymous registry checks re-hashed both indexes (linux/amd64 and linux/arm64 only).
They matched each architecture's manifest and config to the tested artifacts.

[Infrastructure PR #17](https://github.com/biozal/cartyx-infrastructure/pull/17),
merged as `ce0276059bb9112c67836049b2e53a5617003ceb`, makes these changes:

- Pins Cassandra `sha256:a8705b2f…` and JanusGraph `sha256:ebd0c068…`.
- Selects all three policy classes together, with a 64 KiB content limit.
- Creates `cartyx_identity` from a new, independent `gremlin-identity-password`
  Secret key. Provisioning only adds that key to an existing Secret, and the
  server refuses to start if the key is missing, too short, or equal to the
  operator password.
- Extends the infrastructure security check, which also runs on every cluster
  restore, to verify restricted-principal denials, operator access and
  GraphBinary rejection.

Dev activation sequence:

1. Added the dev key; every existing key was hash-verified unchanged.
2. Took a verified pre-upgrade off-host backup.
3. Merged. Dev upgraded on its original retained volume.
4. Confirmed dev graph smoke, TLS/authentication, restricted-principal, scoped
   CQL and live NetworkPolicy checks all passed.
5. Ran this repository's complete identity suite against live dev through
   `cartyx_identity`, with operator connections only for schema checks,
   deliberate corruption and exact cleanup. The suite covered publication,
   import, settings, login, token, provider, admission, bulk and wire denials.
   Dev control records returned to zero.
6. Took a new post-upgrade off-host backup and restored it into an independent
   namespace/volume in 70 seconds. The restore passed the infrastructure checks
   and the same complete restricted application suite, using only the
   credentials recovered from the archive.
7. Removed only that verified scratch namespace/volume. The source volume and
   readiness were unchanged.

Dev has no `cartyx_denied` principal, so on dev that sub-assertion only proves
an unknown-principal refusal. CI still stages a valid denied principal.

Operator note: `kubectl port-forward` (client 1.36) terminates every forwarded
connection after the server deliberately closes one rejected connection. The
wire-denial contracts therefore used a per-connection SSH local tunnel to the
data Service ClusterIPs on the node. The infrastructure restore check runs its
GraphBinary rejection last for the same reason.

Application Graph foundation CI now pins `ce02760` for the fixture comparison,
the standard graph job and the configured-policy recovery job. The recovery job
uses the published digests without an image override. It only adds its
fixture-only denied principal after asserting the pinned configuration already
selects the policy.

## Remaining work

- Promote production separately through its immutable release and recovery
  workflow. Provision the prod identity key before production reconciles the tag.
- Before any target activation, give application pods a separate namespace Secret
  containing only the identity credential and CA (never `cartyx-data`), and label
  them as data clients. Application user/campaign authorization remains necessary.

The handler rollout does not resolve provider logout/reauthorization policy,
OAuth admission/session binding or the other identity cutover gates. Mongo remains
authoritative. PR #557 and the external handoff record exact-head application CI.

## Configured-policy application rehearsal

The separate `Identity authorization (real TLS databases and restore)` CI job
originally built the unpublished PR #16 candidate and staged the policy itself.
It now runs the published pins and deployed configuration from `ce02760` on a
disposable runner. The infrastructure tooling generates distinct random operator
and identity-service credentials. The job adds only a denied-principal fixture.
Runtime backend selection remains unchanged.

`scripts/identity/authorization-ci.mjs` refuses existing stacks, source volumes,
credentials or restart witnesses and requires the dedicated CI checkout. The
profile integration and persistence fixtures use `cartyx_identity` for every
repository operation; separate operator connections handle schema checks,
intentional corruption and exact fixture cleanup. This is fixture wiring under
`scripts/`, not an application credential fallback.

The real TLS/GraphSON JavaScript contract checks explicit server denials for
mutation, nested extra steps, source instructions, cross-owner links, scripts,
request options, aliases, processors and close/session operations. It also probes
guarded text/binary decoding, typed values, duplicate/trailing JSON, unsupported
MIME, HTTP refusal, wrong credentials and a valid but unauthorized principal.
Overlapping operator/service requests must preserve principal isolation and
immutable profile contents. Existing publication/import/settings/login/token/
provider/admission/bulk contracts run through the restricted connection.

The job runs the retained-operation witnesses across actual database restart,
then backs up another pending set using the infrastructure's drained backup tool.
It recovers/cleans the source, stops it, restores into a verified distinct volume,
and routes the original loopback endpoint to the restored server. The exact
private witness and bulk package are reused without changing IDs, contents,
CA or endpoint/port bindings. Recovery and authorization contracts must pass on
the restored database and the original source must pass again afterward. Only
synthetic fixtures are used; credentials, archives, plans and database logs are
never uploaded as artifacts. This is an isolated application gate, not a live dev
backup rehearsal or authorization to select the target backend.

The workflow result for the exact application head must be checked before citing
this rehearsal as passed. Live dev recovery evidence is recorded above; immutable
production promotion remains separate.
