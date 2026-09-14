# Identity repository — Mongo-backed extraction

The identity/access extraction moves request-time user reads, login/token writes,
profile/preferences, media prefixes and user-side campaign mirrors behind server
repository interfaces. It continues in draft PR #557 against `dev`. All repository
instances are explicitly Mongo-backed. There is no backend-selection flag, graph import,
target schema change or live application deployment in this slice.

## Boundary and callers

`app/server/repositories/identity/types.ts` defines driver-independent contracts.
Inputs and results contain strings, dates and plain values; no Mongoose documents,
queries, ObjectIds or general database filters cross the interface. The Mongo
factories receive explicit models, allowing the same behavior contract to run with
isolated real database fixtures. `index.ts` binds the production models.

| Caller                           | Repository responsibility                                                                                 | Behavior kept at the caller                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `utils/oauth.ts` login           | Find/update by exact provider ID, claim an email-only account, or create a new account                    | Provider exchange, encryption, optional profile-field construction, session claims, telemetry and availability checks |
| `utils/oauth.ts` logout          | Explicit encrypted access-token read and clearing stored tokens                                           | Decryption, provider revocation, best-effort logout handling                                                          |
| `functions/auth.ts`              | Read the current profile and ruler preference, update ruler color                                         | Authentication, DTO shaping, display/default fallback and error handling                                              |
| `utils/requireCampaignMember.ts` | Resolve the session provider ID to the application user ID; read authoritative campaign ownership/members | Permission decision and indistinguishable missing/non-member error                                                    |

Domain functions, session access, the play route and `requireActor` now resolve
provider identities through this boundary. `mapAoE` reads only display-name fields;
`audio-storage` delegates prefix persistence while retaining key construction and
validation. Server-handler dynamic imports remain dynamic to preserve client
bundling. Bootstrap, inspection, source export and development fixtures remain
explicit database/operator code.

Application IDs cross the boundary as strings. Mongo domain schemas cast typed
references back to BSON. The deprecated join path explicitly converts the legacy
`Player.userId` filter to ObjectId because that field is absent from the current
Player schema and would otherwise escape Mongoose casting.

Ordinary identity results explicitly enumerate the public profile fields. They
exclude token envelopes, media prefixes, memberships and unknown stored fields.
Sensitive token access has a separate named method; it returns the access
token envelope and a server-only user/provider/token-generation fence. Mongoose's hidden-field selection remains
explicit inside the adapter. The token encryption key and session cookie format
are unchanged. These interfaces are server-only and do not grant authorization.

## Login and mutation contract

- Provider IDs and emails retain exact values/casing. Existing sparse unique
  indexes remain authoritative. Index creation is still governed by the app's
  existing bootstrap/operator policy, not repository construction.
- Login first updates a matching provider identity, then atomically claims an
  exact email match whose provider ID is null/missing, then upserts by provider ID.
  A bound account cannot be claimed by a different identity. No automatic write
  retry or multi-operation transaction is introduced.
- Login can write only the declared provider/profile/token/login-time fields.
  It cannot overwrite role, ID, campaign membership, preferences, media prefix,
  original creation time or unknown legacy fields. New accounts have role
  `unknown`; their creation and last-login timestamps use the login event time.
- A returned profile is evidence that the persistence operation returned an
  account. The previously possible null final result now throws
  `Identity was not persisted` rather than allowing a session with no stored
  account. Storage/connection errors still propagate; a failed first write does
  not fall through into another write attempt.
- Under concurrent first login or account claim, successful operations resolve
  to one stored account. The existing Mongo sequence may reject a losing unique
  index race. A later explicit login can reconcile by provider ID. This is not
  a promise that every concurrent request succeeds or an exactly-once contract.
- Preference updates modify only `preferences.rulerColor`, preserve other nested
  preferences, and do not create a missing account. Clearing tokens conditionally
  unsets the observed token bundle and returns `cleared` or `stale`. Neither
  operation upserts a missing user. Legacy token reads may conditionally add a
  missing bundle revision; see the token clearing runbook for recovery semantics.

The shared campaign guard reads the Mongo campaign on every call. It preserves
legacy owner access, explicit GM membership and player membership. A session's
global role or a duplicated `User.campaigns` array cannot grant access. Revocation
is observed on the next read; missing campaigns and non-members get the same
`CampaignAccessError`. This does not provide an atomic authorization-plus-mutation
transaction across subsequent domain operations.

## Media prefixes and transitional membership writes

Media namespaces retain the existing 128-bit lowercase hexadecimal format. A
read-only lookup never assigns one. Concurrent first assignments conditionally
write only a null/missing prefix and return the persisted winner; they never
return an unpersisted candidate. A unique-index collision propagates without
assigning another account's prefix. Existing prefixes are preserved.

`IdentityMembershipMirrorRepository` writes only the user-side campaign link.
Campaign ownership/membership remains the authorization authority. Campaign
creation uses `membershipMirrorForMongoTransaction` to retain its existing Mongo
transaction: the campaign and user link commit or roll back together. This
explicitly Mongo-specific binding must be replaced with recoverable orchestration
before identity moves to another store.

Join paths retain their existing sequential writes and partial-failure behavior.
The mirror preserves `$push`/`$addToSet` and generated subdocument IDs; it does not
promise idempotency. Missing-user updates do not upsert. The session access guard
still requires an explicit campaign member, including for legacy owners; its
policy remains distinct from the shared campaign guard's owner fallback.

## Validation

`npm run identity:test` now runs the reusable repository behavior contract in
addition to the snapshot archive tests. It uses its own authenticated Docker
replica set and database, manually installs actual User/Campaign schema indexes,
and checks:

- New/returning login and missing/explicit-null provider account claiming.
- Preservation of IDs, role, creation time, names/avatar, unknown fields,
  preferences and media prefixes, plus forbidden wider login input fields.
- Public DTO privacy, explicit token retrieval/clearing and nested preference
  preservation; ordinary reads do not update login state.
- Bound-account collision refusal, exact identity matching, twelve concurrent
  new logins and twelve concurrent claims, one resulting account, and subsequent
  explicit reconciliation. Only unique-index conflicts may reject a racing call.
- Campaign ownership/member conversion and visibility of a subsequent revocation.
- Read-only missing-prefix behavior, twelve concurrent assignments for both
  missing and explicit-null prefixes, stable subsequent reads and distinct owners.
- A forced cross-account prefix collision with exactly one persisted winner.
- String-to-BSON campaign/member/mirror references, preserved unrelated fields,
  missing-user no-upsert behavior, and campaign/mirror transaction commit/abort.

Local MongoDB 7.0.41 passes this contract. The existing MongoDB 7/8 CI matrix runs
the same contract with pinned images. The fixture ignores application Mongo
environment settings, imports no app connection/bootstrap, and writes only to its
own disposable Docker database. No live Atlas records are mutated by these tests.
See [source preflight](2026-09-13-identity-source-preflight.md) for image/kernel
details, private source archives and the existing read-only dev/prod evidence.

Unit tests retain OAuth encryption/revocation, failure propagation and campaign
denial checks, and add null-persistence refusal, role refresh/DTO filtering,
anonymous/unavailable preference behavior, failed writes, best-effort logout,
legacy-owner access and revoked-member denial. Session access regression tests
preserve member-only authorization and separate provider/application IDs. An AST
boundary test rejects direct User model imports (including dynamic imports) and
literal users-collection access outside database/operator and identity repository
code. Application CI covers build and
browser behavior before the PR is updated for review.

## Remaining identity work before target storage can become authoritative

All currently identified request-time User model consumers now use repositories.
The [identity availability boundary](2026-09-14-identity-availability.md) now
checks the selected identity adapter before every operation. Identity-only OAuth,
profile/preferences and actor orchestration use this boundary. Mixed domain callers
retain their separate Mongo checks because campaigns/sessions and other models still
depend on Mongo. Storage selection remains fixed; extraction alone does not make a
graph switch safe.

Next work:

1. Implement readiness/health for the completed target identity composition and
   replace the Mongo transaction/mirror dependency with a recoverable contract
   before enabling a target backend. The caller/repository availability separation
   is in place, with Mongo still selected.
2. Integrate the inactive [account state protocol](2026-09-13-identity-account-state.md)
   with source-account selection, import and provider revocation. It builds on the
   [reservation preparation journal](2026-09-13-identity-reservations.md), which now
   covers immutable identifier ownership and interrupted preparation. Account-level
   release and recovery for partial graph/CQL writes remain required. The subsequent
   [token clearing contract](2026-09-13-identity-token-clearing.md) now fences Mongo
   logout against the generation it read and provides inactive target clear recovery.
   External provider revocation overlap still needs its own protocol before cutover.
3. Build on the inactive [graph publication/read facet](2026-09-13-identity-graph-profiles.md).
   Separate runtime Gremlin authorization from schema administration, finish target
   write operations and importer, and exercise the same behavior contracts
   plus target-specific fault/recovery tests.
4. Rehearse the verified BSON import in dev, validate actual login/access and
   recovery, then cut over dev and production separately under the migration
   plan's maintenance and rollback rules. Campaign membership remains Mongo's
   authority until its own migration.

MongoDB remains authoritative throughout this extraction. The identity/access
phase and broader phase-4 gates are still open.
