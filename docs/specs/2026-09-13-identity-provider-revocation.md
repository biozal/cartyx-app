# Provider revocation attempts and database-only recovery

PR #557 adds an **inactive** provider-attempt journal and transport adapter. The
active Mongo OAuth flow is unchanged. These APIs provide one dispatch opportunity
per stored token generation and recover local clearing from a recorded response.
They do not serialize provider grants, admit logins, or establish that external
revocation has completed. No real provider requests are made by the fixtures.

## Provider behavior and ordering decision

The following primary documentation was reviewed on September 13, 2026:

| Provider | Existing logout request                                              | Meaning and limits                                                                                                                                                                     |
| -------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google   | `POST https://oauth2.googleapis.com/revoke`                          | Documented success is HTTP 200. Revocation affects granted scopes and issued tokens across clients in the project, and full effect can be delayed.                                     |
| GitHub   | `DELETE /applications/{client_id}/token` using app Basic credentials | Deletes one token; documented success is HTTP 204. The separate `/grant` endpoint deletes the user's application authorization and associated tokens. Cartyx continues using `/token`. |
| Apple    | No external request on ordinary Cartyx logout                        | Apple supports a separate revocation endpoint, but enabling it would change current logout behavior. Account deletion remains a separate concern.                                      |

Sources: [Google web-server OAuth revocation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke),
[GitHub OAuth application endpoints](https://docs.github.com/en/rest/apps/oauth-applications#delete-an-app-token),
[Apple token revocation](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens).

Consequently, neither a current database token revision nor a successful HTTP
response proves that a concurrent or subsequent login's grant is safe. Tokens can
also be returned again in a later database generation. A per-generation dispatch
claim does not prevent a different generation from submitting the same token.
An application lock expiring while HTTP is pending would permit an old worker to
revoke after a newer login; checking the lock immediately before fetch has the same
gap. There is no timeout, lease takeover or automatic resend in this protocol.

Target runtime activation still requires a provider-specific login admission and
reauthorization policy. It must address authorization requests and token exchanges
already in flight **before** `target-login.prepare` runs, provider identity being
unknown before exchange, shared Google project clients, uncertain requests and
delayed propagation. A delayed verified OAuth response must not simply acquire a
fresh database precondition and be treated as newly issued credentials. A process
restart, a negative token check or an arbitrary waiting period is not documented
provider-completion evidence. No such guarantee is inferred here.

## Private preparation and identity checks

`createIdentityProviderRevocations(state)` is a server/operator primitive, not an
`IdentityRepository` runtime facet. The caller must establish authorization and the
required external ordering/quiescence before dispatch. There is no apply CLI and
no call from the active OAuth code or target login code.

`prepare(fence, clientId)` reads settled account/token state only. It validates the
original user/provider/generation fence, requires an access envelope, brackets the
token read with the same account revision, and takes the provider name from the
actual account binding. Only Google, GitHub and Apple are supported. Missing
access tokens, stale generations and invalid application configuration fail before
a plan is returned; the eventual runtime caller must retain the current early
return for accounts with no access token. There is no fallback to a different user
or newer token generation.

The plan retains the original encrypted access token, exact fence, provider name,
client ID and a fresh token-clear operation ID. It never contains plaintext,
refresh tokens or client secrets. Retain the exact plan privately, bound to the
intended environment/store, before `begin(plan)`. The whole prepared payload is
validated and bounded by the existing 16 KiB control-state limit. Source envelopes
and encryption keys are unchanged. This adds no schema migration.

The journal key is `user:<canonical ID> / identity_provider_revocation /
<token revision>`. This prevents multiple operation IDs from dispatching the same
stored generation. A SHA-256 plan digest prevents substitution, including after
the encrypted plan has been stripped. Preparing again generates a different
clear-operation ID and is not recovery; repeat `begin` with the retained plan.

## Dispatch and recovery states

| State        | Meaning                                                                                                                        | Allowed continuation                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `prepared`   | Retained intent; no worker has claimed dispatch.                                                                               | Explicit `dispatch`; `resume` only reports this state.                             |
| `attempting` | Dispatch claim committed; HTTP might not have started, might be in flight, or might have finished without a recorded response. | Read-only inspection. No resend, timeout release, force-completion or local clear. |
| `response`   | A concrete HTTP status or explicit configured skip is durable.                                                                 | Database-only `resume` of the original token clear.                                |
| `settled`    | The original clear has a durable `cleared` or `stale` outcome.                                                                 | Historical inspection/replay only.                                                 |
| `stale`      | A generation/binding/envelope check failed before transport.                                                                   | Historical inspection only; no HTTP or clear.                                      |

Dispatch verifies the transport's provider and client ID against the retained plan.
It checks the settled generation and encrypted access envelope, then conditionally
replaces `prepared` with `attempting`. Only the worker receiving a definitive true
CAS result may call transport. A false result never sends, and an uncertain result
throws. Inspecting a committed claim does not confer dispatch permission. The
plan is stripped at this claim; the winning worker retains its local copy only.

A second settled-state check after the claim can mark an already superseded
generation stale. This reduces stale calls but is not atomic with external HTTP.
If it is still current, transport gets a cloned plan and is invoked once. The
response status or skip is then conditionally recorded. Crashes before HTTP,
decryption failures, lost responses, aborts and failed response-journal writes can
all leave `attempting`. If an uncertain response write actually committed,
inspection observes `response` and local recovery can proceed. Otherwise there is
no automatic way to distinguish those cases or resolve the external outcome.

`resume(fence)` never receives a transport. With a recorded response, it begins
and resumes the retained `createIdentityTokenClearer` operation, recovering an
unreceipted account commit before ordinary account reads. Media-only revision
changes can reconcile through that existing protocol. A newer login produces
local `stale` and preserves the newer pair. Resolved HTTP failures still permit
the original local clear, matching active logout behavior; they are not called
successful revocations. Historical `settled` never clears a subsequent generation
or issues a session. Local completion and provider outcome stay separate.

Inspection exposes only state, provider, response/skip and local outcome. Errors
from dispatch/resume become `IdentityProviderRevocationError(tokenRevision)` without
a transport cause, URL, response body or token. The caller must privately retain
the full original fence to locate the user-scoped journal. Prepared journals are
sensitive. No TTL, receipt deletion, reclamation, or manual resolution API exists.

## Inactive transport adapter

`createProviderRevocationTransport` captures an explicit provider/client ID,
private optional client secret, decrypt function and fetch implementation. It
never reads configuration from a journal or persists app credentials. The
production fetch implementation must not be wrapped in retry middleware.

Google receives its token in the form body, never in the URL. GitHub receives
Basic application credentials and a JSON access token at the existing `/token`
endpoint, with API version `2026-03-10`. Redirects are refused and each request has
a 15-second abort deadline; an abort is uncertainty, not proof of cancellation at
the provider. Response bodies are discarded; only HTTP status is returned.
The adapter makes at most one fetch call. It records Apple ordinary logout and
GitHub missing-secret behavior as explicit skips, after decryption as in the
existing flow. Missing or invalid client IDs fail preparation.

## Evidence and remaining work

The shared contract runs on memory, local Docker and Kubernetes dev stores with
synthetic HTTP responses only. It covers eight competing dispatchers/resumers,
Google/GitHub/Apple policy branches, failed HTTP statuses, a login during HTTP,
pre-dispatch supersession, changed-plan rejection, lost HTTP responses, stripped
tokens and all ten journal/local-clear write boundaries before and after commit.
Tests assert zero HTTP calls after a committed-but-unacknowledged dispatch claim
and no duplicate HTTP after any later fault. Separate adapter tests check actual
request shapes, application binding, redirects, skips and no retry.

The restart helper retains exact synthetic resources before writes. One witness
has a recorded provider response and an unreceipted account clear; the other has
an unresolved attempt. In a new process, the first finishes local clearing and the
second stays unresolved with its original stored tokens. Both refuse HTTP replay.
Local seed/verify does not restart developer services; CI performs the actual
database restart. Final local/dev/CI results belong in PR #557 and the handoff.

This closes durable attempt accounting and local recovery only. Login admission,
provider completion/reauthorization policy, operator resolution of unresolved
attempts, environment-bound retention tooling, runtime integration, bulk import,
Gremlin authorization and the other identity cutover gates remain open. Mongo
continues serving every subsystem. No source accounts or production schema are
changed by this slice.
