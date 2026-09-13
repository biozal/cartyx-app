# Identity token generation fencing and recoverable clearing

PR #557 replaces `clearTokens(providerId)` with a server-only observed-generation
contract. A login that finishes while logout is waiting for its provider request
must retain its newly stored token pair. Mongo remains the selected repository;
the Cassandra token facet is inactive. No target login, backend switch, source
account import or production schema change is included.

## Contract and active Mongo behavior

`readAccessToken(providerId)` returns an encrypted access envelope plus a fence:
canonical application user ID, exact provider ID and UUID token revision. The
caller passes just those three fence fields to `clearTokens`, which returns
`cleared` or `stale`. Invalid fences fail before mutation. Neither the fence nor
the encrypted envelope belongs in browser DTOs, cookies, logs or telemetry.

Mongo login installs a fresh `oauthTokens.revision` in the same atomic update as
the encrypted pair. Identical envelopes and identical login timestamps still
receive a new revision. Preferences, media allocation and membership changes do
not rotate it. A conditional clear matches user ID, provider ID and that revision,
then removes the entire token bundle. Repeating the old fence is stale. The
existing `select: false` token boundary also hides this revision from normal reads.

Legacy bundles have no revision. Reading one conditionally adds a UUID only when
the entire observed bundle still matches and its revision is still absent. It
preserves access/refresh envelopes and unrelated source fields. A definitive lost
CAS permits rereading, with at most three attempts; a thrown read/write error
propagates immediately. Explicit null or malformed revisions are refused. This
legacy token read can therefore write fencing metadata; it is not an audit API.

Keeping the revision inside the bundle also fences a newer clear against an older
application instance's whole-bundle login: that old login removes the old revision
when replacing the pair. An old binary's unconditional logout is still old behavior;
all serving instances must run the updated consumer to obtain the new guarantee.
Normal token writers must replace the bundle and revision together. Manual token
patches that retain an existing revision violate this protocol.

Mongo has no durable clear receipt. An uncertain clear is not retried internally.
Reusing its fence cannot erase a later generation, but a subsequent `stale` result
does not distinguish an earlier successful clear from another writer's advancement.
Never infer successful external provider revocation from either database outcome.

The BSON mapper explicitly validates `oauthTokens.revision` when present and
preserves it in the original archive/digest. It is not part of the target encrypted
pair: target import creates a fresh initial revision through its own account
operation. Source fences are not carried into the target database. Existing private
archives remain required for original BSON representation and complete source data.

## Inactive target coordination

`createTargetIdentityTokens(state)` exposes the same read/clear facet. Reads resolve
the exact provider reservation and verify the settled account's actual binding.
Stranded reservations, mismatched bindings and missing access tokens return null;
unsettled account receipts fail. There is no Mongo fallback or implicit read recovery.

`createIdentityTokenClearer(state)` provides explicit `begin(operationId, fence)`
and `resume(operationId)` for operator recovery. A new version-1 record at
`global / identity_token_clear / operationId` retains the immutable fence, status
and current account attempt. It contains no encrypted tokens. No schema migration,
TTL, deletion or reclamation API is added.

1. Persist the fence before creating any account command. Reusing an operation ID
   with a different fence fails, including after terminal completion.
2. Read the settled account and compare its binding and token revision. A missing
   account or changed generation finishes `stale` without clearing anything.
3. Persist an attempt containing the observed account revision and a fresh account
   operation ID, then run the existing revision-checked `logout` command.
4. On explicit resume, recover that retained command before reading the account:
   the account may already have committed with an unfinished receipt. An applied
   command finishes `cleared`. Unrelated pending account operations are not resumed.
5. Only a definitive rejected account receipt allows a new attempt, and only
   while the original provider binding and token generation still match. This
   reconciles media-only account revision changes. A concurrent login ends stale.
   Each call has three bounded coordination iterations; further contention retains
   its attempt for explicit resume. Transport or receipt failures stop immediately.
6. Terminal records retain the fence and outcome, removing attempt details.
   A historical `cleared` receipt means that generation was cleared earlier. Resume
   returns that historical result without touching newer tokens; it is not proof
   the account is currently tokenless and never authorizes session issuance.

The repository convenience method reports `IdentityTokenClearError(operationId)`
on uncertainty or bounded contention. Retain that operation reference privately.
If the initial intent never persisted, repeat `begin` with the original fence and
same operation ID before resuming. Without that retained fence, do not invent a
replacement intent from a newer token read. Recovery is server/operator-only.

## Provider revocation boundary and remaining gate

OAuth retains its existing order: read/decrypt, attempt the configured provider
request, then clear the originally observed database generation. It does not reread
and clear newer tokens after the HTTP request. Its existing missing-token,
unsupported-provider and missing-configuration branches remain unchanged. A
rejected fetch exits through the existing error handler without clearing or retrying;
a resolved HTTP response still follows the previous clear behavior, including
non-success statuses. This change does not claim that a resolved request revoked
the provider grant.

Database fencing cannot undo or fence the provider-side HTTP effect. Target
activation still requires a provider-specific protocol for login/revocation
overlap, the scope of grant revocation, credential handling, response classification
and uncertain requests. That protocol must define which new logins are allowed
while revocation is pending and when reauthorization is required. A database-only
CAS or an automatic HTTP retry is insufficient evidence. This slice deliberately
adds no target provider HTTP caller or provider-completion receipt.

Target login/profile coordination, environment-bound bulk import/reconciliation,
runtime Gremlin authorization, availability boundaries, campaign transaction
replacement and the other phase-4 gates remain required before cutover.

## Verification

The shared synthetic token contract runs against memory and real local/dev
JanusGraph/Cassandra. It covers every coordinator/account write boundary before
and after commit, eight concurrent resumes, delayed physical logout CAS after a
login or media allocation, uncertain attempt-pointer advancement, historical
replay after newer login, immutable fence reuse, binding checks and read failures.
The restart helper records exact synthetic resources before mutations, leaves a
clear committed with an unfinished account receipt, then resumes in a fresh
process and verifies token removal with preserved binding/profile. CI performs
the actual database restart; local seed/verify does not restart developer services.

Real Mongo fixtures cover identical-pair revision rotation, legacy upgrade
concurrency, hidden revisions, preserved source fields, wrong-account/provider
fences, media/preferences during logout, a delayed clear after modern and older
whole-bundle login, a login during legacy upgrade, and errors before/after physical
upgrade/clear mutations without internal retry. OAuth tests retain the original
fence across a simulated login during provider HTTP and refuse database clearing
after an uncertain request. The existing CI matrix runs MongoDB 7 and 8.
