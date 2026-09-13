# Target login selection and recoverable coordination

PR #557 adds an inactive `recordLogin` facet over the existing reservation,
account and graph-profile protocols. Mongo remains the selected runtime repository.
This slice makes no provider HTTP requests, issues no cookies, imports no source
accounts and changes no database schema. It does not enable a partial backend flag.

## Trusted input and account selection

`createTargetIdentityLogin(state, graph)` accepts the existing `RecordIdentityLogin`
contract. The caller must have newly verified the provider response; this is not a
browser-facing mutation or a way to authenticate from a reservation or old receipt.
Input is cloned and validated before asynchronous work. Only provider identity,
optional email/name/avatar fields, encrypted tokens and login time are accepted as
login-owned fields. Extra role, preference, membership or media fields are ignored.
Encryption and key management remain at the existing OAuth boundary.

Selection is exact and case-sensitive:

1. Look up the provider-ID reservation first. Its owner must have a settled account
   bound to the same provider ID **and provider name**, plus a verified published
   profile. A missing, unbound or mismatched account fails; it never falls through
   to email selection. A reservation alone cannot authenticate an account.
2. With no provider reservation, an incoming email can select its reserved owner
   only if the settled account is unbound and its current email equals that exact
   value. A bound account, missing owner or retained old email reservation fails.
3. With neither reservation, mint a canonical 24-hex user ID once and retain it in
   the plan. Registration creates an unbound account before eventually applying
   the provider binding and token pair. It never overwrites an occupied account ID.

Existing account revisions bracket the profile read during preparation. A login
that changes the account in that interval invalidates selection, preventing old
input from acquiring a newer profile precondition. Every selected ID, command,
snapshot and expected revision is then fixed; recovery never reselects an account
or silently rebases the request.

Existing role, ruler color, creation time and omitted name/avatar fields come from
the verified current graph snapshot. Account login preserves an omitted email and
the existing media namespace. Membership authority/mirrors are untouched. A new
profile uses role `unknown`, null omitted fields and the request timestamp for
creation and last login. Original BSON archives remain required for source
representations outside the target projection.

## Durable plan and ordered writes

`createIdentityLoginCoordinator` exposes `prepare(input)`, `begin(plan)` and
`resume(operationId)` for server/operator use. Prepare reads only; it returns a
complete plan including encrypted tokens. Retain that plan privately before
beginning an operator-managed operation. Do not rerun preparation to resume one.

A version-1 `global / identity_login / operationId` record retains the prepared
plan, user/operation IDs and its digest. The entire payload must fit the existing
16 KiB bound before any write. Subcommand identity/revision relationships are
validated before reserving identifiers. Reusing an ID with changed input or plan
fails. The existing account-login and profile-publication schemas are reused
without changing their persisted formats or digests.

Resume runs these retained steps:

1. Reserve the exact provider ID and incoming email for the selected user.
2. For registration only, initialize an absent unbound account with that email,
   no tokens and no media namespace, using its retained initialization ID.
3. Publish the planned graph profile with the original profile-head revision.
4. Apply account login with the original account revision, reserved binding and
   encrypted pair. Its operation ID becomes the new token generation.
5. Record `applied` when both profile and account suboperations have applied, or
   `rejected` when a reservation/conditional suboperation definitively loses.

Every step reuses its own recovery journal. An uncertain write/read throws and
stops; no automatic retries, account reselection or new operation IDs are introduced.
Terminal login receipts strip the plan, retaining digest/identity/outcome instead
of historical encrypted token copies. No TTL, deletion or reclamation API is added.

These are ordered conditional writes across stores, not an atomic transaction.
A rejected account update can leave an already-published name/avatar/login-time
revision, and reservation conflicts retain earlier claims. A media assignment can
invalidate the account precondition after profile publication. A preference write
can invalidate the profile precondition before token mutation. Neither conflict
restores old state or silently overwrites the other writer. A fresh verified login
may prepare against settled current state; it is a new operation, not recovery.
Pending lower-level receipts must be recovered before ordinary reads can proceed.

## Returning a login result and handling uncertainty

The convenience `recordLogin` method creates a fresh plan, begins it, resumes it
and then verifies current state before returning a whitelisted `IdentityProfile`.
The encrypted-token read and final ordinary-account read must have the same
non-reusable account revision, bracketing the verified profile read. The binding,
encrypted pair and token generation must match this login, and the current profile
head must still select this login's publication. This establishes a consistent
observed result rather than treating historical receipts as current state.

A later login, logout or profile publication prevents the old result from returning.
A completed media-only write before this verification is compatible because its
token generation is unchanged; an account change during the read interval fails
the revision bracket. As with other repository reads, subsequent operations may
advance state after the verified observation. This does not lock future session
issuance against later logout or provider revocation.

`IdentityLoginError(operationId, outcome)` distinguishes `rejected`, `uncertain`
and `superseded` for private server/operator handling. It contains no private
profile or token values. Failures during read-only selection precede a persisted
operation and simply propagate; no session may be issued on any failure.

Explicit `resume` returns only `applied` or `rejected`, never a profile or session.
An `applied` receipt describes historical suboperations, which need not still be
current. Terminal replay performs no token restoration or profile reselection.
If the initial journal insertion was uncertain, repeat `begin` only with the exact
retained plan, then resume. If no plan/journal survived, do not reconstruct an old
operation from a newly prepared request. The runtime convenience method supplies
an operation reference on uncertainty, but does not provide a public recovery API.

## Verification and remaining gates

The shared `identityLoginContract` runs in unit tests and the real local/dev
JanusGraph/Cassandra harness. It verifies retained IDs, exact provider-first and
email-only selection, stranded reservation refusal, field/media preservation,
tokenless logins, input/plan bounds, concurrent first and returning logins, eight
concurrent resumes, and all 16 registration write boundaries before/after commit,
including the physical graph-store call. Existing lower-level contracts separately
fault each physical owner/revision/edge mutation and account/profile receipt write.
JanusGraph lock contention may make a concurrent worker fail with an uncertain
outcome. The contract waits for every worker, then explicitly resumes the retained
operations and verifies the winner. Failed real-store runs retain their exact
fixture manifests for explicit cleanup, even after an initial cleanup pass.

Interleavings cover preferences and media after preparation, delayed graph writes
after a newer login, a login during selection, and login/logout/preference/media
changes after component completion but before returning the result. Historical
recovery is checked against later token/profile state. CI also records a login
whose account write committed without its receipt, restarts the real databases,
resumes in a fresh process and verifies the original ID, token pair and profile.
Witnesses and cleanup are limited to exact synthetic resources. The local seed/
verify helper exercises recovery without restarting developer services.

Provider-specific login/revocation overlap and uncertain HTTP requests remain a
cutover gate. This protocol orders prepared database operations; it does not infer
provider token issue order from delayed OAuth responses. Runtime integration must
define that ordering and its session/revocation behavior. Environment-bound bulk
import/reconciliation, Gremlin runtime authorization, availability separation,
campaign transactions, operational retention/recovery tooling and maintenance-mode
dev/prod cutovers also remain open. These inactive facets do not establish cutover
readiness or justify retiring Mongo.

## Subsequent provider-attempt work

The [inactive provider-attempt journal](2026-09-13-identity-provider-revocation.md)
retains one dispatch opportunity per token generation and recovers local clearing
from recorded HTTP evidence. It never replays an uncertain provider request. It
does not gate this login coordinator: provider-specific admission must cover
authorization/exchange requests before database preparation, and Google revocation
can have wider scope and delayed propagation. No runtime activation is implied.
