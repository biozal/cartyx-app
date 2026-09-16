# Gremlin authorization request isolation

The authorization-handler prerequisite is published and deployed to dev. Runtime
application graph authorization remains a cutover gate: the server still has only
an operator account, and administrator credentials must not be mounted into
application containers. Profile revisions remain immutable by the repository API,
pending a server policy that prevents bypasses.

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

## Remaining work

- Promote production separately through its immutable release and recovery workflow.
- Complete candidate verification/publication and configure the server-enforced
  policy only with real JanusGraph application, TLS and recovery evidence. The
  candidate channelizer gates close and session requests before the stock switch.
- Issue runtime credentials only with the completed policy. Verify authenticated
  protocol requests, immutable-profile recovery and denied bypasses before selecting
  target storage. Application user/campaign authorization remains necessary.

The handler rollout does not resolve provider logout/reauthorization policy,
OAuth admission/session binding or the other identity cutover gates. Mongo remains
authoritative. PR #557 and the external handoff record exact-head application CI.
