# Identity repository — Mongo-backed extraction

The first identity/access code slice moves login persistence, logout token access,
profile/preferences and the shared campaign access check behind server repository
interfaces. It continues in draft PR #557 against `dev`. Both repository instances
are explicitly Mongo-backed. There is no backend-selection flag, graph import,
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

Ordinary identity results explicitly enumerate the public profile fields. They
exclude token envelopes, media prefixes, memberships and unknown stored fields.
Sensitive token access has a separate named method; it returns only the access
token envelope needed for revocation. Mongoose's hidden-field selection remains
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
  preferences, and do not create a missing account. Clearing tokens unsets only
  the token envelope. Those two methods retain existing missing-user no-op
  semantics; callers retain their current success/default behavior.

The shared campaign guard reads the Mongo campaign on every call. It preserves
legacy owner access, explicit GM membership and player membership. A session's
global role or a duplicated `User.campaigns` array cannot grant access. Revocation
is observed on the next read; missing campaigns and non-members get the same
`CampaignAccessError`. This does not provide an atomic authorization-plus-mutation
transaction across subsequent domain operations.

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

Local MongoDB 7.0.41 passes this contract. The existing MongoDB 7/8 CI matrix runs
the same contract with pinned images. The fixture ignores application Mongo
environment settings, imports no app connection/bootstrap, and writes only to its
own disposable Docker database. No live Atlas records are mutated by these tests.
See [source preflight](2026-09-13-identity-source-preflight.md) for image/kernel
details, private source archives and the existing read-only dev/prod evidence.

Unit tests retain OAuth encryption/revocation, failure propagation and campaign
denial checks, and add null-persistence refusal, role refresh/DTO filtering,
anonymous/unavailable preference behavior, failed writes, best-effort logout,
legacy-owner access and revoked-member denial. Application CI covers build and
browser behavior before the PR is updated for review.

## Remaining identity work before target storage can become authoritative

This boundary is intentionally incomplete across the application. Existing Mongo
availability/bootstrap calls remain at callers. Direct User access still exists
in campaign/session/player functions, `sessionAccess`, `audio-storage` prefix
operations, `mapAoE`, the play route, and identity lookups in tags, session events,
tabletop, rules, notes, cleanup, monsters and GM screens. Development fixtures and
database inspection also access users. Move these operations through reviewed
interfaces before enabling a target backend; otherwise login and other domains
would read different identity authorities.

Next work:

1. Complete those identity operations and availability boundaries while preserving
   campaign/session authorities on Mongo. Test lazy, concurrent media-prefix
   assignment and membership mirror writes as explicit transitional operations.
2. Define target identity reservations and an authoritative conditional operation
   record with recovery for partial graph/CQL writes, uniqueness conflicts and
   unknown commit outcomes. Address login/logout overlap: current logout clears
   by provider ID and is not conditional on the token revision it read. This
   extraction preserves that behavior; it does not establish safe token fencing.
3. Separate runtime Gremlin authorization from schema administration, implement
   the graph/CQL adapter and importer, and exercise the same behavior contracts
   plus target-specific fault/recovery tests.
4. Rehearse the verified BSON import in dev, validate actual login/access and
   recovery, then cut over dev and production separately under the migration
   plan's maintenance and rollback rules. Campaign membership remains Mongo's
   authority until its own migration.

MongoDB remains authoritative throughout this extraction. The identity/access
phase and broader phase-4 gates are still open.
