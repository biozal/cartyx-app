# Identity storage availability

Identity-only callers previously decided whether to read or write an account using
Mongo's connection status. That would keep OAuth, profile/preferences and actor
resolution coupled to Mongo even after a future identity cutover. Other callers
could reach the identity adapter without checking that a connection was available.

`createIdentityStorage(repository, connect)` now pairs an identity adapter with
its own availability callback. The runtime exports the guarded repository and
`ensureIdentityAvailable` from the same composition. Every repository operation
awaits a fresh check before invoking the adapter. False or a non-boolean result
refuses the operation with `IdentityStorageUnavailableError` (status 503 and the
serialization-compatible message `Database not connected`). Connection setup errors
propagate. Earlier successful checks are not cached or treated as readiness leases.

Arguments are cloned before the availability await, including nested encrypted
token fields, token-generation fences and Dates. Mutating a caller-owned command
while connection setup is pending cannot change the operation subsequently sent
to the adapter. The wrapper invokes the adapter once and propagates its result or
failure; it does not retry, rebase, switch backends or conceal uncertain writes.

The active composition remains explicitly Mongo:

- `index.ts` binds the existing Mongo identity adapter to `connectDB` and
  `isDBConnected`, retaining the existing shared-connection and bootstrap policy.
- OAuth orchestration and the shared actor resolver no longer import Mongo's
  connection module. The actor resolver still loads server modules dynamically
  from server-function handlers; client bundle isolation is preserved.
- Profile and preference handlers use identity availability for fallback decisions.
  The guarded operation checks availability again before storage access.
- Campaign membership, session authorization, domain models and the legacy user-side
  campaign mirror still depend on Mongo. Their existing domain connection checks and
  transaction behavior remain. The mixed session party-token handler still requires
  Mongo before loading campaign/session authorization.
- The health endpoint still pings the active Mongo backend. A future target identity
  composition must provide readiness/health for its actual Cassandra and graph
  dependencies and update health reporting before selection. This change installs
  no target credentials or target readiness implementation.

## Preserved request behavior

| Request                                         | Unavailable identity storage                                                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anonymous profile/preferences/actor request     | No identity connection or repository operation is attempted                                                                                          |
| `getMe`                                         | A false check retains the existing signed-session display fields; setup exceptions propagate, and lookup failures keep the existing display fallback |
| Read preferences                                | The existing default color is returned on unavailable/failed storage                                                                                 |
| Write preferences                               | The write is refused; no success response is fabricated                                                                                              |
| OAuth login                                     | No account write or session result is produced                                                                                                       |
| Logout                                          | The existing best-effort revocation/clear flow remains; local cookie clearing still proceeds through its existing handler                            |
| Actor resolution and media namespace operations | Storage is refused before querying a user or allocating a namespace; failure is not interpreted as a missing prefix                                  |

Availability is not authentication or campaign authorization. A successful check
does not prove that a later query or write will succeed. Session validation, exact
account binding, membership/GM checks, value validation and write-recovery protocols
remain necessary. No partially migrated backend, automatic fallback or provider
policy change is enabled. All application subsystems still use Mongo.

## Validation

Unit contracts cover every identity operation with unavailable/failed connections,
a later successful check, input mutation during a delayed check, and uncertain
writes without automatic replay. Authentication tests exercise identity readiness
independently of Mongo domain readiness while preserving display fallbacks, anonymous
behavior and write refusal. Audio/actor tests stop before user lookup or domain calls
on identity failure. Existing OAuth encryption/revocation, role filtering, membership,
session access and media namespace tests remain in place. The AST boundary guard
also forbids direct Mongo connection imports in identity-only OAuth/actor modules.

The authenticated disposable Mongo fixture runs its real repository contract through
the same availability composition, then closes the real connection and verifies
read/write refusal without buffering model operations. CI exercises this on MongoDB
7 and 8, along with application builds/browser tests and the unchanged graph/CQL
restart contracts. Exact-head results are recorded in PR #557 and the external
migration handoff. No source archive or real account is modified by these checks.
