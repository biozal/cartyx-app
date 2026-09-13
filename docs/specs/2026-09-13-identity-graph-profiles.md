# Graph profile publication and target identity reads

This slice in draft PR #557 adds actual JanusGraph profile storage, recoverable
publication through Cassandra, and the target identity repository's **read facet**.
The application binding remains Mongo-backed. Local Docker and Kubernetes dev
receive the additive profile schema and synthetic verification records; production
and source accounts are unchanged. Full target writes and import remain ahead.

## Content and authority

A stable `User` vertex retains the legacy ObjectId as application `entityId`, with
identity tuple `(global, User, <user ID>)`. Its `HAS_PROFILE_REVISION` edges lead to
`UserProfileRevision` vertices, each identified by
`(user:<user ID>, UserProfileRevision, <snapshot ObjectId>)`. JanusGraph internal
vertex IDs never reach the application API.

Revision vertices own profile content: first/last name, avatar URL, role, ruler
color, created-at and last-login timestamps. Fields are individual graph
properties, with a SHA-256 digest of the validated full snapshot. Provider binding,
email, encrypted tokens and private audio namespace stay in account state; they
are not copied into the graph. Existing campaign membership still owns access.

A Cassandra `identity_profile_head` row in `user:<user ID>` scope selects the
published snapshot, storing only snapshot ID/digest and operation identity. It
owns publication selection, not a duplicate profile document. An
`identity_profile_operation` journal stores the prepared immutable command and
later a digest/outcome receipt. Terminal receipts omit the snapshot body.

Multiple revision edges are expected. Their presence alone does not mean a
revision is current. Readers must follow the verified publication pointer, rather
than select an arbitrary/latest edge or use a stale graph property for permission.
This leaves a stable User vertex available for later wiki/campaign relationships.

## Immutable writes and recovery

The graph adapter conditionally creates the User, conditionally creates the
revision, then creates/repairs their unique edge. Existing revision content is
never updated. Reusing a revision ID with different content fails. Reads verify
label, identity tuple, allowed single-valued properties, all content against its
digest, the owner vertex and exactly one matching edge. Missing links can be
repaired by explicitly repeating the same put; corrupt content fails for operator
investigation and is not overwritten.

This is immutability enforced by the repository API, not a claim that admin
Gremlin credentials cannot change a vertex. Runtime permission separation and
preventing unrestricted traversal access remain cutover gates. Schema labels are
not static, so partial edge creation can be repaired. JanusGraph's
[static vertex restriction](https://docs.janusgraph.org/schema/advschema/) would
prevent modification after the creating transaction. Stored content verification
also detects direct edits before they can be returned as a published profile.

Publication uses the same durable receipt discipline as account state:

1. Retain operation UUID, snapshot ID/full content and expected head revision,
   then persist the prepared command with `begin`.
2. `resume` verifies the expected head and its previous applied receipt. It writes
   and rereads the complete linked graph revision before attempting a pointer CAS.
3. The pointer CAS selects that revision only if the expected head is still
   current. A receipt records applied/rejected; the next publication cannot pass
   a committed pointer whose receipt is unfinished.
4. An uncertain read/write throws. Explicit resume reuses the saved operation,
   repairing partial graph creation or recording a lost receipt. A graph lock
   conflict may reject a call; the adapter does not automatically retry it.

A delayed worker can finish creating an unselected old revision, but cannot
replace a newer pointer or mutate that newer revision. Historical applied receipts
are not evidence of current publication. Rejected/unfinished graph versions remain
retained; garbage collection, operation retention and safe reclamation need their
own protocol before cutover. Never delete a version that an in-flight reader or
recovery operation may still need.

Cassandra and JanusGraph are not a single transaction. Graph content is verified
before pointer selection, and reads verify it again. Missing or changed content,
a missing link, or an unfinished receipt fails without falling back to Mongo.
A current-profile read is anchored to one pointer revision; account and profile
reads do not constitute an atomic snapshot across both authorities.

## Read facet and limits

`createTargetIdentityReader` implements profile lookup, application ID lookup,
display names, ruler preferences and read-only audio prefix lookup. Provider
lookup resolves a reservation owner, then checks that the settled account is
actually bound to that exact provider ID. A stranded reservation or unbound
account returns no user. A bound account with missing publication fails.

Public profile results explicitly include only ID/email/name/avatar/role. Private
prefixes have their own method; encrypted tokens and journal data cannot escape
through these DTOs. Reads do not mint prefixes, perform recovery writes or consult
Mongo. The target reader is not exported by the active application binding.

Publishing a complete snapshot is a trusted operator/repository primitive. It is
not an end-user update route: callers must separately authorize role changes,
protect creation timestamps and preserve fields omitted by login/preferences
updates. Source matching, bound-account/token import, profile merge/write methods,
media assignment, provider revocation, availability separation and campaign
transaction replacement are still required before a full target adapter/cutover.

Snapshot fields are required and nullable; absent graph properties decode to
null. The importer must explicitly account for source missing-versus-null values
and unknown legacy fields. Names are bounded to 1,024 UTF-16 code units, avatar
URLs to 4,096, roles to gm/player/unknown/null and ruler colors to hex/null. Dates
must be canonical UTC ISO timestamps. Full prepared payloads must fit the existing
16 KiB CQL limit. No source value is silently truncated or repaired.

## Additive schema and operations

The new component marker is `cartyx_identity_profiles`, version `0001`, using the
existing unique schema-record index. Its definition checksum is
`d3d293a368e35ae622e963a981417b1df9c3d59d130a5e3fd417638d8968d9bd`.
The foundation's applied `cartyx` 0001 definition/checksum is untouched. This
additive component has its own marker, with no changes to existing key/index
semantics. Future changes require an explicit component version transition.

The installer first verifies the foundation's enabled composite indexes. A
single-server monitor serializes component installs. It checks String/SINGLE
properties, labels and the directed SIMPLE edge with LOCK consistency. A separate
read-only lifecycle audit rejects nonzero TTL on these types. Verify refuses a
missing component; apply does not repair missing schema after a completion marker
or accept a changed checksum. Tests never install schema implicitly.

With the existing explicit local Gremlin environment configured:

```sh
npm run identity:graph-schema -- apply
npm run identity:graph-schema -- verify
npm run cql:local -- identity-graph-test
npm run cql:local -- identity-graph-seed
npm run cql:local -- identity-graph-verify
```

The local helper's new modes explicitly use the running local database stack and
local credentials. Kubernetes dev uses explicit port forwards and the existing
`GREMLIN_*` / `CQL_*` environment configuration, then runs the same schema CLI and
`npx tsx scripts/identity/graph-integration.ts`. Do not select production implicitly.
Current runtime Gremlin separation is incomplete; only operator/test credentials
are used. No database credentials are added to application deployments.

Tests record exact synthetic vertex identities/CQL keys privately before mutation
in `.local/identity-graph-runs/<random>.json`. Linked vertices are deleted
sequentially to avoid contending on shared edge locks. If cleanup is interrupted,
use the matching environment and pass that exact generated manifest as the
integration script's argument to perform cleanup only. For local:

```sh
npm run cql:local -- identity-graph-test .local/identity-graph-runs/<generated-id>.json
```

The restart fixture is `.local/cql/identity-graph-persistence.json`; do not overwrite
it to start a new run. Its synthetic graph revision/link and CQL pointer are written
before a simulated lost receipt. CI restarts Cassandra and JanusGraph, then a new
process verifies graph content, resumes publication and cleans up exact witnesses.
Local seed/verify exercises the helper without restarting developer services.

## Evidence and remaining gates

Unit and real-container contracts cover immutable replay, scope isolation, input
privacy, eight competing publishers, interruptions before/after journal/graph/head/
receipt writes, delayed old graph writers, unfinished receipt refusal, reservation
versus account binding and target DTOs. Real Gremlin checks also interrupt all three
physical graph writes, repair missing edges, reject corrupt content, verify schema
repeat/concurrency/checksum refusal and preserve the foundation schema.

The target read facet and publication protocol are ready for the next integration
slice. They do not complete identity migration or validate importing existing
accounts. Runtime authorization, full target writes, preservation audits/import,
recovery tooling and separate dev/prod cutovers remain open.
