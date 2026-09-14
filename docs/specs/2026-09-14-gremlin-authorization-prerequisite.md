# Gremlin authorization request isolation

Runtime graph authorization remains a cutover gate. The current infrastructure
endpoint authenticates only an administrator, whose credentials must not be
mounted into application containers. Profile revisions remain immutable by the
repository API, pending a server policy that prevents bypasses.

Inspection of the pinned TinkerPop 3.7.6 server found a prerequisite defect:
its shared authorization handlers retain an authenticated user in a mutable field.
Overlapping WebSocket connections can authorize a request with another connection's
principal; HTTP denials can audit another connection's principal. The upstream
[request-isolation fix](https://github.com/apache/tinkerpop/commit/eae093bbfdbaf599fff0e44cb7250bf360dba706)
is backported in the candidate build in
[infrastructure PR #14](https://github.com/biozal/cartyx-infrastructure/pull/14),
at `555321c6f8d2b02f69502cf01d90ed07e95f27c7`.

The candidate also removes request content and Authorizer exception messages from
authorization-denial responses/logs, and releases malformed HTTP request buffers.
It replaces exactly two classes in the server JAR and locks the output checksum.
Storage versions, schemas, deployed image pins and credentials are unchanged.
The candidate also refreshes four superseded Ubuntu Python package pins to
`3.12.3-1ubuntu0.17` so fresh Cassandra builds remain possible; wheel hashes and
Cassandra JAR locks are unchanged.

The image build uses deterministic overlapping requests to reproduce both original
isolation failures before exercising the patched handlers. It also checks restricted
bytecode forwarding, anonymous identity, denied scripts/bytecode, unexpected failures,
private-content exclusion and HTTP reference counts. These tests use the actual
server handlers with Netty embedded channels. They are not an end-to-end runtime
authorization policy test. The existing native image CI additionally builds/scans
both architectures and tests TLS, authentication, persistence and fresh-volume restore.

## Remaining work

1. Review and publish the infrastructure candidate, verify its multi-architecture
   digest, then promote image pins separately with the documented dev recovery
   rehearsal. Application CI currently remains pinned to the deployed infrastructure
   revision; a green application workflow does not demonstrate use of this candidate.
2. Define a server-enforced application policy that permits the exact profile
   creation/read/link operations and prevents general mutation. A client traversal
   allowlist is insufficient. Check nested bytecode, scripts/lambdas, traversal-source
   instructions, aliases, processors/sessions, deserialization and concurrency.
   The stock close-request behavior is unchanged by this backport.
3. Issue separate runtime credentials only with the completed policy. Verify actual
   authenticated protocol requests, immutable profile recovery and denial of bypasses
   before selecting the target composition. Application user/campaign authorization
   remains necessary in addition to service-account permissions.

This prerequisite does not add an Authorizer, issue an application graph password,
activate target storage or resolve provider logout/reauthorization policy. Mongo
remains authoritative. Exact-head verification and promotion state belong in PR #557
and the external migration handoff.
