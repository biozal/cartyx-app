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

## Remaining work

- Promote production separately through its immutable release and recovery workflow.
- Define a server-enforced application policy allowing the exact profile operations
  and preventing general mutation. Check nested bytecode, scripts/lambdas, source
  instructions, aliases, processors/sessions, deserialization and concurrency.
  A client allowlist is insufficient; the stock close-request behavior is unchanged.
- Issue runtime credentials only with the completed policy. Verify authenticated
  protocol requests, immutable-profile recovery and denied bypasses before selecting
  target storage. Application user/campaign authorization remains necessary.

The handler rollout does not resolve provider logout/reauthorization policy,
OAuth admission/session binding or the other identity cutover gates. Mongo remains
authoritative. PR #557 and the external handoff record exact-head application CI.
