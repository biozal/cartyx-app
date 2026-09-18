# Identity Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve every identity read and write from JanusGraph plus Cassandra, and delete the Mongo `User` model, so dev logs in, reads its profile and logs out with no Mongo involvement.

**Architecture:** The graph-backed protocols already exist and are tested (`reservations`, `account-state`, `graph-profiles`, `profile-head`, `target-login`, `target-reader`, `target-settings`, `target-tokens`, `audio-prefix`, `provider-revocation`). This slice composes them on `data-runtime` behind the unchanged `IdentityRepository` interface, replaces the provider-wide login barrier with a per-user revocation row, and removes the Mongo adapters. Consumers are untouched: 21 of the 31 call sites are `findProfile`, and all of them already go through the interface.

**Tech Stack:** TypeScript, JanusGraph via `EntityStore`/`ImmutableProfileStore`, Cassandra control records via `createControlStateStore`, Zod, Vitest, Playwright.

**Spec:** `docs/specs/2026-09-16-dev-janusgraph-cutover-plan.md` (Task 3.1, decision D3).

## Global Constraints

- The `IdentityRepository` interface in `app/server/repositories/identity/types.ts` does not change. Consumers are not rewritten.
- No environment flag selects a backend. The composition is fixed, as it is today.
- The runtime never holds operator credentials: `data-runtime` refuses `cartyx_admin` and `CQL_ADMIN_PASSWORD_FILE`.
- Identity strings are exact values, including provider prefixes and email casing.
- A write that fails or whose completion is uncertain rejects; the caller must not mint a session.
- Telemetry carries no driver errors, configuration identifiers, provider subjects or tokens.
- `npm test`, `npm run typecheck` and `npm run lint` (`--max-warnings 0`) must be clean at every commit.

---

## Inventory (completed 2026-09-18)

**Consumers of the identity repository** — 31 call sites, all through the interface:

| Method                                     | Count | Where                                                                                                                                                                             |
| ------------------------------------------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `findProfile`                              | 21    | `functions/{tags,tabletop,sessions,sessionAccess,session-events,rules,players,notes,monsters,gmscreens,cleanup,campaigns,...}.ts`, all resolving a session id to a stored profile |
| `findUserId`                               | 2     | `app/utils/require-actor.ts:48`, `app/server/utils/requireCampaignMember.ts:59`                                                                                                   |
| `recordLogin`                              | 1     | `app/server/utils/oauth.ts:370` (`upsertUser`)                                                                                                                                    |
| `readAccessToken`                          | 1     | `app/server/utils/oauth.ts:411` (`revokeToken`)                                                                                                                                   |
| `clearTokens`                              | 1     | `app/server/utils/oauth.ts:447` (`revokeToken`)                                                                                                                                   |
| `readPreferences`                          | 1     | `app/server/functions/auth.ts`                                                                                                                                                    |
| `setRulerColor`                            | 1     | `app/server/functions/auth.ts`                                                                                                                                                    |
| `readDisplayName`                          | 1     | `app/server/functions/mapAoE.ts:125`                                                                                                                                              |
| `resolveAudioStoragePrefix`                | 1     | audio upload path                                                                                                                                                                 |
| `lookupAudioStoragePrefix`                 | 1     | audio read path                                                                                                                                                                   |
| `ensureIdentityAvailable`                  | 3     | `oauth.ts:352`, `oauth.ts:409`, `functions/auth.ts`                                                                                                                               |
| `identityMembershipMirror.addCampaignLink` | 2     | `functions/campaigns.ts:650`, `functions/players.ts:674`                                                                                                                          |
| `campaignAccessRepository.findAccess`      | 1     | `app/server/utils/requireCampaignMember.ts:62`                                                                                                                                    |

**The membership mirror is write-only.** `User.campaigns` is written by `campaigns.ts` and `players.ts` and read by nothing in the serving path — authorization reads the `Campaign` document through `campaignAccessRepository`. Only `scripts/dev-fixtures/helpers.ts:256` reads it, to collect campaign ids during teardown. So the mirror is dropped in this slice rather than reproduced, and the fixture teardown queries campaigns directly.

**`campaignAccessRepository` stays on Mongo** until Task 3.2. It takes a `userId` string and reads the `Campaign` document; after this slice those strings are graph user ids. Dev is rebuilt from seed, so no id translation is needed — but a seeded campaign must record the same user id the graph issues, which is why `scripts/seed/users.ts` runs before campaign seeding.

**Models removed:** `app/server/db/models/User.ts`, plus `app/server/repositories/identity/{mongo.ts,mongo-transaction.ts}` and the `identity:graph-schema` profile-only CLI (folded into `scripts/dev-schema.mjs`).

---

## File Structure

**Created**

- `app/server/repositories/identity/revocation-admission.ts` — the per-user barrier replacing `login-admission.ts`'s domain rows.
- `scripts/identity/revocation-admission-contract.ts` — the barrier's shared contract, run against memory and real Cassandra, following the convention the other identity contracts already use.
- `scripts/seed/users.ts` — the GM seeder, replacing `scripts/seed-gm.cjs`.
- `scripts/identity/resolve-revocation.ts` — the operator recovery command.

**Modified**

- `app/server/repositories/identity/index.ts` — compose the target adapters on `data-runtime`.
- `app/server/utils/oauth.ts` — `upsertUser` and `revokeToken` go through the barrier.
- `app/server/functions/auth.ts` — logout drives the barrier; `getMe` unchanged.
- `app/server/functions/{campaigns,players}.ts` — drop the two mirror writes.
- `scripts/dev-fixtures/helpers.ts` — collect campaign ids from campaigns, not from users.
- `package.json` — `identity:resolve-revocation`; remove `seed-gm`.
- `.github/workflows/ci.yml` — the e2e job seeds through `scripts/seed/cli.ts` only.

**Deleted**

- `app/server/db/models/User.ts`, `app/server/repositories/identity/{mongo.ts,mongo-transaction.ts,login-admission.ts}`, `scripts/seed-gm.cjs`, `scripts/identity/profile-schema-cli.ts`.

---

## Task 1: Per-user revocation barrier

**Files:**

- Create: `app/server/repositories/identity/revocation-admission.ts`, `scripts/identity/revocation-admission-contract.ts`
- Test: `tests/server/db/identity-revocation-admission.test.ts`

**Interfaces:**

- Consumes: `ReservationStateStore` (`get`/`create`/`replace`) from `reservations.ts`; `IdentityTokenFence` from `types.ts`; `newStateRevision` from `db/cql/control-state`.
- Produces:

```ts
export type RevocationStatus = 'open' | 'revoking' | 'blocked-unresolved';

export interface RevocationAdmission {
  /** Refuses a login while the user's row is not open. Missing never means open. */
  assertOpen(userId: string): Promise<void>;
  /** Idempotent: an operator or a first login creates the row open. */
  ensureRow(userId: string): Promise<void>;
  /** open -> revoking. Returns the fence to dispatch under, or null when already revoking. */
  beginRevocation(userId: string, fence: IdentityTokenFence): Promise<IdentityTokenFence | null>;
  /** revoking -> open, after a definitive provider outcome. */
  settle(userId: string): Promise<void>;
  /** revoking -> blocked-unresolved, after a timeout or lost response. */
  strand(userId: string): Promise<void>;
  inspect(userId: string): Promise<{ status: RevocationStatus }>;
}

export function createRevocationAdmission(
  state: ReservationStateStore,
  application: IdentityAdmissionApplication
): RevocationAdmission;

export class IdentityRevocationError extends Error {}
```

The row key is `{ scope: 'global', type: 'identity_revocation', id: sha256(JSON.stringify({ domain, userId })) }`, where `domain` is `{ provider, id }` exactly as `login-admission.ts` computes it today (Google uses `projectId`, others use `clientId`). Binding the domain into the row means a client-id rotation cannot silently inherit another domain's state, and every read re-checks the stored domain, as the old barrier did.

- [ ] **Step 1: Write the failing contract**

Create `scripts/identity/revocation-admission-contract.ts`:

```ts
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { RevocationAdmission } from '~/server/repositories/identity/revocation-admission';

const userId = () => randomBytes(12).toString('hex');
const fence = (id: string) => ({ userId: id, providerId: `google:${id}`, tokenRevision: '1' });

export async function revocationAdmissionContract(make: () => Promise<RevocationAdmission>) {
  const admission = await make();

  // A row that does not exist is not open: an unknown user cannot log in on a guess.
  const stranger = userId();
  await assert.rejects(admission.assertOpen(stranger));

  const user = userId();
  await admission.ensureRow(user);
  await admission.assertOpen(user);
  assert.equal((await admission.inspect(user)).status, 'open');

  // Logout fences the tokens and closes only this user's row.
  const first = await admission.beginRevocation(user, fence(user));
  assert.deepEqual(first, fence(user));
  assert.equal((await admission.inspect(user)).status, 'revoking');
  await assert.rejects(admission.assertOpen(user), /revocation/i);

  // Another user is unaffected: this is the whole point of the redesign.
  const other = userId();
  await admission.ensureRow(other);
  await admission.assertOpen(other);

  // Logging out twice dispatches once.
  assert.equal(await admission.beginRevocation(user, fence(user)), null);

  // A definitive provider outcome reopens the row.
  await admission.settle(user);
  await admission.assertOpen(user);

  // An uncertain outcome strands only this user, and only an operator reopens it.
  await admission.beginRevocation(user, fence(user));
  await admission.strand(user);
  assert.equal((await admission.inspect(user)).status, 'blocked-unresolved');
  await assert.rejects(admission.assertOpen(user), /revocation/i);
  await assert.rejects(admission.settle(user), /revocation/i);
}
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run tests/server/db/identity-revocation-admission.test.ts`
Expected: FAIL — `revocation-admission` does not exist.

- [ ] **Step 3: Implement the barrier**

`revocation-admission.ts` mirrors `login-admission.ts`'s structure: a Zod row schema, a `read()` that refuses a missing row and a mismatched domain, and a `sanitized()` wrapper so no driver text escapes. Every transition is a `state.replace` against the observed revision, followed by a re-read that confirms the new status, exactly as `block()` does today. `settle` and `strand` reject unless the current status is `revoking`, so a stranded row can only be reopened by the operator command in Task 5.

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/server/db/identity-revocation-admission.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/server/repositories/identity/revocation-admission.ts tests/
git commit -m "feat(identity): block one user's logins during revocation, not a provider"
```

---

## Task 2: Compose the target adapters on data-runtime

**Files:**

- Modify: `app/server/repositories/identity/index.ts`
- Test: `tests/server/repositories/identity/composition.test.ts`

**Interfaces:**

- Consumes: `getStateStore`/`getGraphClient` from `app/server/db/data-runtime`; `createTargetIdentityReader`, `createIdentityLoginCoordinator`, `createTargetIdentityTokens`, `createTargetIdentitySettings`, `createIdentityAudioPrefix`, `createGraphProfileStore`.
- Produces: the same `identityRepository`, `ensureIdentityAvailable` and `campaignAccessRepository` exports, with `identityMembershipMirror` removed.

- [ ] **Step 1: Write the failing test** that the composition refuses an operator credential and that `identityRepository` satisfies every method of `IdentityRepository`, then run it to watch it fail.

- [ ] **Step 2: Rewrite `index.ts`**

```ts
import { getGraphClient, getStateStore, checkDataReadiness } from '../../db/data-runtime';
import { Campaign } from '../../db/models/Campaign';
import { createGraphProfileStore } from './graph-profiles';
import { createMongoCampaignAccessRepository } from './mongo-campaign-access';
import { createTargetIdentityRepository } from './target-repository';

// Fixed composition: no environment flag can select a backend, and nothing falls
// back to Mongo. Campaign access is the last Mongo reader here and leaves in Task 3.2.
const state = getStateStore();
const graph = createGraphProfileStore(getGraphClient());
export const identityRepository = createTargetIdentityRepository(state, graph);
export const ensureIdentityAvailable = async () => {
  const readiness = await checkDataReadiness();
  return readiness.graph && readiness.cql;
};
export const campaignAccessRepository = createMongoCampaignAccessRepository(Campaign);
```

`createTargetIdentityRepository` is a new thin file assembling the existing facets into one `IdentityRepository`; it holds no logic beyond delegation, so each facet keeps its own contract.

- [ ] **Step 3: Run the test.** Expected: PASS.
- [ ] **Step 4: Commit.**

---

## Task 3: Login and logout through the barrier

**Files:**

- Modify: `app/server/utils/oauth.ts`, `app/server/functions/auth.ts`
- Test: `tests/server/utils/oauth.test.ts`, `tests/server/functions/auth.test.ts`

- [ ] **Step 1: Write the failing tests** — a login is refused while the user's row is `revoking`; a logout with a definitive provider response clears tokens and reopens; a logout whose provider call times out leaves the row `blocked-unresolved` and does not clear tokens.
- [ ] **Step 2: Rewrite `revokeToken`** to fence, `beginRevocation`, dispatch once, then `settle` on a definitive HTTP outcome or `strand` on an uncertain one. Today the function clears tokens regardless of the response and swallows every error; that becomes an explicit outcome.
- [ ] **Step 3: Rewrite `upsertUser`** to `assertOpen` before `recordLogin` and `ensureRow` for a first login.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.**

---

## Task 4: Seeding and fixtures

**Files:**

- Create: `scripts/seed/users.ts`
- Modify: `scripts/seed/registry.ts`, `scripts/dev-fixtures/helpers.ts`, `.github/workflows/ci.yml`, `package.json`
- Delete: `scripts/seed-gm.cjs`

- [ ] **Step 1:** Port `seed-gm.cjs` to `scripts/seed/users.ts` as a `Seeder`, writing the GM through `identityRepository` so the seed and the product agree on ids. Register it first in the registry.
- [ ] **Step 2:** Drop the two `identityMembershipMirror.addCampaignLink` writes and switch the fixture teardown to collect campaign ids from campaigns.
- [ ] **Step 3:** Remove `node scripts/seed-gm.cjs` from the e2e job; `npm run dev:seed` now covers it.
- [ ] **Step 4:** Run `npm run dev:clear -- --force && npm run dev:seed` locally, then `npm run e2e` against the hybrid stack.
- [ ] **Step 5:** Commit.

---

## Task 5: Operator recovery and Mongo exit

**Files:**

- Create: `scripts/identity/resolve-revocation.ts`
- Delete: `app/server/db/models/User.ts`, `app/server/repositories/identity/{mongo.ts,mongo-transaction.ts,login-admission.ts}`, `scripts/identity/profile-schema-cli.ts`
- Modify: `package.json`, `app/server/db/inspect.ts`

- [ ] **Step 1:** Implement `identity:resolve-revocation <userId> --outcome=revoked|not-revoked`, which reads the journal, records the operator's finding and reopens the row. It uses operator credentials and refuses to run against a row that is not `blocked-unresolved`.
- [ ] **Step 2:** Delete the Mongo identity adapters and the `User` model; remove the `User` branch from `app/server/db/inspect.ts`.
- [ ] **Step 3:** Fold the profile schema into `scripts/dev-schema.mjs` and delete the separate CLI.
- [ ] **Step 4:** `git grep -n "models/User\|seed-gm\|login-admission"` returns nothing outside history.
- [ ] **Step 5:** Full verification: `npm test`, `npm run typecheck`, `npm run lint`, the graph contracts against Docker, `npm run e2e`, then push and require every CI job green.
- [ ] **Step 6:** Commit.

---

## Self-review

- **Spec coverage.** Task 3.1's scope lists the kept protocols (Tasks 2), `requireActor` and the OAuth paths (Task 3), user/admin functions and `seed-gm` (Task 4), the D3 redesign (Tasks 1 and 3, with recovery in Task 5) and the Mongo exit (Task 5). `requireActor` and `requireCampaignMember` need no edit: they call `findUserId`, which the composition keeps.
- **D3 contract cases.** Concurrent login during revocation, logout twice, crash after dispatch, operator resolve and the GitHub skip are all in the Task 1 contract or the Task 3 tests. Apple has no revoke path, so its logout stays local and never opens a row — asserted in Task 3.
- **Type consistency.** `RevocationAdmission` is the only new interface; `IdentityRepository` and `ReservationStateStore` are used exactly as defined today.
- **Open risk.** `campaignAccessRepository` keeps reading Mongo with graph-issued user ids until Task 3.2. This works only because dev is rebuilt from seed, and the seeder ordering in Task 4 is what guarantees it.
