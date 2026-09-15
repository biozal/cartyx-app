# OAuth login admission barrier

PR #557 adds inactive admission primitives and facades over target login and
provider revocation. Mongo remains active. This is a conservative barrier for
rejecting delayed OAuth responses, **not a completed reauthorization policy**.
No serving route, cookie, source account, production schema or provider is changed.

## Scope and provider policy

The provider subject is unknown when authorization starts. Admission therefore
uses a whole provider domain: Google's exact project ID, or GitHub/Apple's exact
client ID. Google clients in the same project share a row, even when their client
IDs differ. Tickets also bind the exact client, so a ticket from one client cannot
be used for another. Separate domains are independent.

This scope is deliberately broader than the affected user. Google's documentation
describes revocation across project clients and delayed effect. GitHub documents
single-token deletion, but a newer database generation does not prove a different
provider token. These facts do not justify reopening on an HTTP response alone.
See [Google revocation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke)
and [GitHub token deletion](https://docs.github.com/en/rest/apps/oauth-applications#delete-an-app-token),
reviewed September 13, 2026. The permanent barrier is our conservative engineering
choice, not a provider requirement or a claim that revocation affects every user.

Apple ordinary logout continues to be a local token clear; the external revocation
facade refuses Apple plans before touching storage. It does not add Apple HTTP.
The existing lower-level transport's missing-GitHub-secret skip remains supported,
but a facade begun as an external attempt stays blocked even if transport skips.
Nothing in this slice is a complete policy for ordinary production logout.

All participating clients/workers must share the same control-state store and
canonical configuration. Project/client IDs come from trusted private operator
configuration, never browser input. This code cannot verify actual Google project
membership. Renaming configuration, moving to another keyspace, deleting a barrier,
or initializing a replacement domain is not a recovery procedure.

## State and admission context

`createIdentityLoginAdmission(state, application)` stores one version-1 row at
`global / identity_login_admission / SHA256(provider-domain)`. The full exact domain
is validated after reads to refuse collision/corruption. The row contains only
domain and `open|blocked`, with the existing non-reusable Cassandra UUID revision.
It has no token, subject, expiry, lease, TTL or per-request collection.

`initialize()` is explicit operator bootstrap, before serving OAuth workers. It
conditionally creates an open row and cannot reset an existing row or change its
epoch. Missing, malformed or unreadable state always refuses admission. Bootstrap
does not prove old requests, sessions or uncoordinated revocations are absent; those
must be reconciled separately before any activation.

`issue()` reads an open row and returns its epoch plus exact application. The
future OAuth entry route must obtain this **before** redirect/authorization and
retain it with the original server-validated OAuth state and browser session.
It is internal context, not a bearer credential, nonce, one-time receipt or proof
of provider authentication. CSRF, state consumption, PKCE and verified provider
identity still belong at the OAuth boundary. No route wiring is included here.

`assert(originalTicket)` checks application, open status and unchanged epoch.
The callback must use that original ticket before token exchange, and again around
login. Minting a ticket after exchange, relabeling an old response or replacing its
timestamp does not establish valid admission. A request that passed a check can
still be paused before HTTP; these checks do not cancel or fence external requests.

`createAdmissionBoundIdentityLogin(...).recordLogin(ticket, input)` clones its
request and ticket, checks provider correspondence, then validates admission before
selection, after preparation before writes, and after current-result verification.
Closure during writes prevents a DTO from returning even if the database login
applied. Existing `IdentityLoginError(operationId, uncertain)` supplies recovery
context for this case. Explicit login recovery still returns historical outcomes
only; it never authenticates. Partial profiles/reservations and committed token
pairs are not rolled back. Unresolved operations still need operator recovery.

The final observation is not atomic with cookie issuance. Closure afterward cannot
invalidate an already returned DTO or existing session. This remains a separate
session integration gate. Direct lower-level login APIs remain inactive primitives
and can bypass admission; runtime composition must prohibit such bypasses.

## Closing before dispatch and recovery

`block()` conditionally changes open to blocked and confirms the saved state.
A definitive CAS loss proceeds only if a read confirms another worker closed it.
A transport/acknowledgement error stops the caller; it never implies HTTP permission.
An explicit later call can inspect/repeat closure. There is **no reopen API**.

`createAdmissionBoundProviderRevocations(state, application)` accepts the exact
privately retained revocation plan for `begin`, `dispatch` and database-only
`resume`. It validates the bounded plan and provider/client before blocking, closes
admission before creating the attempt journal, and checks the retained plan digest
before dispatch/recovery. Only the existing per-generation definitive dispatch-CAS
winner may send. An uncertain closure never reaches dispatch. A crash after closure
but before the attempt journal leaves the domain blocked; retain the exact plan
privately so explicit recovery can finish beginning it.

Prepared, stale, skipped, HTTP-success, HTTP-failure and unresolved-attempt outcomes
all leave admission blocked. Historical replay and local token-clear recovery
cannot release the domain. The barrier is not proof of provider completion,
quiescence or safe reauthorization. In particular an `attempting` record stays
unresolved, without HTTP replay, timeout release or force-completion.

The remaining policy must provide evidence for external resolution and safe fresh
authorization, reduce the coarse domain-wide denial, coordinate all project clients,
and address existing sessions and responses already in flight. Until that exists,
this barrier must remain inactive. Operator environment-bound plan retention, bulk
import, runtime availability/Gremlin authorization, and other identity cutover gates
also remain open.

## Verification

`identityLoginAdmissionContract` runs on memory and the local/dev real-store harness.
It covers concurrent bootstrap/closure/dispatch, shared Google projects, exact-client
tickets, independent domains, delayed callbacks, closure during committed login,
historical recovery, false CAS reconciliation and before/after-commit faults at both
closure and journal creation. Provider requests are synthetic. Unit checks also
refuse invalid configuration, tickets, corrupt domains and malformed/bounded plans.

The restart witness records exact admission resources and original tickets privately
before mutations. It loses the closure acknowledgement, then retains one recorded
response/unreceipted clear and one unresolved provider attempt. In another process,
recovery refuses the original tickets, new admission and bootstrap reopening while
recovering local state without HTTP replay. Local seed/verify does not restart the
developer's databases; CI performs the actual restart. Exact cleanup includes the
synthetic admission rows. Final verification evidence is recorded in the handoff.
