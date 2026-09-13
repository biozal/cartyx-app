# Target identity preference and media writes

PR #557 adds an inactive target implementation of `setRulerColor` and
`resolveAudioStoragePrefix`. The application still selects the complete Mongo
repository explicitly. These methods are server-only and require the existing
caller authentication/authorization checks; no graph credentials or recovery API
are exposed to browsers. No source accounts or production schema are changed.

## Preference updates

`createTargetIdentitySettings(state, graph)` resolves an exact provider reservation,
checks the settled account's actual provider binding, then reads the verified current
graph profile. Missing/unbound/mismatched accounts produce the existing repository's
no-op behavior. A bound account with missing or unsettled graph content fails.

Only a six-digit hex ruler color is accepted. The method constructs a new profile
snapshot with that color and preserves every other field from verified graph content.
Publication uses the observed head revision as a compare-and-set precondition. A
concurrent profile update therefore rejects the stale edit instead of restoring
older names, role, avatar or timestamps. This path never changes account/token state.

`IdentityPreferenceWriteError` carries an operation UUID and `rejected` or `uncertain`
outcome for server/operator recovery. It contains no profile, provider, token or media
values. An uncertain write must not be treated as success or retried automatically.
An operator can inspect the profile operation and resume it through the existing
profile publisher. Resumption retains its original snapshot and expected revision;
an old request cannot rebase itself over a newer profile. If the first journal write
never persisted, there is no stored command to resume. A later fresh user request
performs a fresh read and publication; it does not prove the older request's outcome.

## Media namespace allocation

`createIdentityAudioAllocator(state)` stores one per-user intent at
`(user:<id>, identity_audio_assignment, prefix)`. It contains the random 128-bit
prefix, reservation operation ID, account operation ID and expected account revision.
The intent is separate from the account's committed namespace. A candidate is never
returned as a usable upload prefix merely because it has an intent or reservation.

1. Read the existing intent first, allowing a previous uncertain account write to
   be recovered. Without an intent, read the settled account: missing users fail,
   existing namespaces are returned only after checking reservation ownership, and
   a missing namespace causes a validated candidate intent to be conditionally created.
2. Racing callers read the winning persisted intent and reserve that exact prefix.
   A cross-account collision fails. No fallback namespace is returned or silently
   generated after a reservation conflict. Claims/intents remain retained for review.
3. The new account `assign_audio` command conditionally fills an absent namespace.
   It checks reservation ownership and cannot replace any established namespace,
   even with another prefix owned by the same user. It preserves provider binding,
   email, token envelopes and token revision, and uses the existing account receipt
   protocol to recover a write committed before its acknowledgement.
4. A login may have advanced the account revision. Only a definitive rejected account
   operation permits advancing the intent to a fresh operation ID/current revision,
   retaining the same candidate and reservation. The method performs at most three
   account attempts per call. Concurrent intent updates use conditional writes;
   transport, read and receipt errors propagate immediately.
5. Return only a settled account's stored prefix with verified reservation ownership.
   An uncertain operation resumes through another call for the same user. No request
   needs to retain an uncommitted candidate. A pending unrelated account operation
   still requires recovery by its owner; allocation does not recover arbitrary logins.

The intent, reservation and operation receipts have no TTL/reclamation path. This
avoids changing namespace ownership on replay; a future release/repair workflow
must preserve the fencing invariants. Allocation advances the account revision
while retaining token revision, so an old account-revision logout command can reject
even when the encrypted tokens themselves have not changed. Runtime token clearing
must carry and reconcile an explicit token revision before target authentication
can be enabled.

## Verification

September 13 synthetic contracts passed against local Docker and Kubernetes dev.
Local restart-helper seed/verify, typecheck, lint and focused unit tests also passed.
The application PR runs these contracts again and performs the actual database
restart with the saved preference/media witnesses.

The shared `identitySettingsContract` runs in unit tests and the existing real
JanusGraph/Cassandra fixture. It verifies:

- Preserved profile fields and token envelopes/revisions; exact provider binding
  rather than reservation-only authorization; invalid color and candidate refusal.
- A delayed preference edit losing to a newer name/role update; interruption before
  and after all publication writes, with explicit operation recovery and no rebase.
- Eight simultaneous uploads converging on one persisted namespace; no remint on
  repeated resolution; existing-namespace replacement and cross-account collision refusal.
- Interruption before/after all seven initial allocation writes and both outcomes
  of an uncertain attempt-pointer update after a concurrent login.
- Concurrent login preserving the newest token state while allocation advances its
  precondition; failed reads causing no subsequent writes or fabricated namespace.

The existing restart helper now records a profile preference and audio account write
committed before their receipts. It retains exact synthetic keys/vertices and the
chosen prefix in its private manifest before mutations. After restart, a fresh
process resumes both operations, checks the color, unchanged token revision/envelopes
and original namespace, then removes the exact witnesses. CI performs an actual
database restart; local seed/verify exercises the helper without restarting the
developer's stack. No schema change is required for these operational records.

## Remaining identity work

Implement target login selection and coordination across account/profile state,
including provider-first lookup, email-only account claims, omitted field preservation,
concurrent settings writes and interrupted login recovery. Replace the current
`readAccessToken`/`clearTokens(providerId)` interface with explicit token-revision
context and define provider revocation ordering/recovery. The current Mongo OAuth
path still performs an external provider request and then clears by provider ID;
stored-state fencing alone cannot undo an external revocation.

Complete the environment-bound private bulk import manifest/reconciliation runner,
availability boundaries, campaign transaction replacement and runtime Gremlin
authorization before a maintenance-mode dev cutover rehearsal. Production activation
remains a separate step after dev evidence. These settings methods do not complete
the target `IdentityRepository` or activate a partial backend switch.
