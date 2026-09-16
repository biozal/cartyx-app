# Dev environment: MongoDB → JanusGraph/Cassandra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each subsystem slice (Phase 3) gets its own detailed TDD plan file, written from the current code immediately before that slice starts (template in "Slice procedure").

**Goal:** The dev environment (local stacks, CI and the `dev` Kubernetes namespace) runs every Cartyx subsystem on JanusGraph + Cassandra with no MongoDB anywhere. All test suites pass against that stack, and the scripts that build test environments seed the graph.

**Architecture:**

- **Domain repositories:** server functions call domain repositories. Graph adapters implement them on a shared, revisioned entity-store library (JanusGraph vertices and edges, with a Lucene mixed index for text search).
- **Operational state:** single-row invariants, job leases and room history live in application-owned Cassandra tables.
- **Server-side limit:** the app authenticates as one restricted graph principal. The server enforces a step-vocabulary policy, and per-user/campaign authorization stays in the repositories.
- **Migration order:** subsystems move one at a time on the `dev` branch. No data is migrated, since dev data is always rebuilt by seed scripts.

**Tech Stack:** TanStack Start (React 19) server functions; `gremlin` 3.7.6 JS (GraphSON 3); `cassandra-driver`; JanusGraph 1.1 / TinkerPop 3.7.6 (hardened image in `cartyx-infrastructure`); Cassandra 4.0; Lucene mixed index; Vitest; Playwright; Helm/Flux on k3s.

**Spec:** this document, plus [the phased migration plan](2026-09-07-janusgraph-cassandra-migration-plan.md) for the target data model (relationship table, scope rules, permission rules). Where the two conflict, the decisions below win.

## Decisions (user, 2026-09-16)

| #   | Decision                                                                                  | Consequence                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Dev runs fully on JanusGraph, with all tests passing, **before** production is discussed. | Production is out of scope. `dev`→`main` promotions are held while slices land (see Branch strategy).                                |
| D2  | **No data migration, ever.** Nobody uses the product.                                     | Remove the Mongo export/import/bulk/preflight/inspection tooling. Environment build and seed scripts must work on the graph instead. |
| D3  | Ordinary logout **revokes the provider grant every time** (today's behavior).             | Replace the provider-wide admission barrier with a **per-user** barrier that reopens after a definitive provider outcome (Task 3.1). |
| D4  | App→graph authorization uses a **step-vocabulary policy** for one app principal.          | Replaces the exact six-form identity allowlist. User/campaign checks stay in repositories.                                           |
| D5  | Full-text search uses JanusGraph's **Lucene** mixed index.                                | Adds a JanusGraph index volume and a reindex step on restore. No Elasticsearch.                                                      |

## Global Constraints

- Every PR targets `dev`, never `main`. PR #557 stays the application PR until the user approves merging it (Checkpoint C1).
- Every task must leave `npm test`, `npm run typecheck` and `npm run lint` (0 warnings, `--max-warnings 0`) clean. Run `bash deploy/charts/cartyx/tests/render-tests.sh` whenever `deploy/charts/` changes. Run `(cd realtime && npm test)` and `(cd audio-worker && npm run typecheck && npm test)` for those packages.
- New npm packages must be published ≥7 days ago and pass `npm run check:deps-age`. `@tanstack/react-router` and `@tanstack/react-start` stay lockstep-pinned.
- Never mount the operator graph password (`gremlin-password`) or the Cassandra admin password into application pods.
- Application IDs stay 24-hex ObjectId-format strings (`graphIdentity`, `app/server/db/graph/identity.ts`). Gremlin internal IDs are never exposed.
- Use bytecode only from the app. No Gremlin scripts at runtime; scripts are for operator schema migrations only.
- Graph queries must hit an index (`query.force-index=true` is deployed). A query that needs a full scan is a bug.
- Existing server-function request/response DTOs stay unchanged. The UI must not notice the backend switch.
- Telemetry calls are never awaited on request paths (CLAUDE.md).
- Unit tests stay fast and hermetic, using in-memory repository fakes. Real-store behavior is proven by contract suites against Docker JanusGraph/Cassandra in CI (CLAUDE.md warns that mocks cannot catch query-shape bugs).

## Definition of done

1. `git grep -nE "mongoose|mongodb|MONGODB_" -- app realtime audio-worker scripts e2e deploy package.json realtime/package.json audio-worker/package.json` returns nothing except historical docs.
2. All of these pass on the `dev` branch with no Mongo service anywhere:
   - `npm test`
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test:storybook`
   - `npm run e2e` (CI job uses the graph stack)
   - the `realtime` and `audio-worker` suites
   - the Graph foundation workflow, including every domain contract suite
   - Helm render tests
3. From a fresh checkout, `npm run dev` (host), the full Compose stack, `deploy/local/deploy-kind.sh` and `npm run e2e:container` each start on the graph. `npm run dev:clear -- --force && npm run dev:seed` rebuilds the three test campaigns plus SRD content in the graph.
4. Deployed `dev`:
   - web, realtime and audio-worker run with no `MONGODB_URI`;
   - `dev:clear`/`dev:seed` run against dev;
   - the manual smoke checklist (Phase 4) passes;
   - an off-host backup and independent restore pass with the domain schema and Lucene reindex.
5. The graph demos from the original plan work in dev: every visible NPC in a town including nested locations, and every visible NPC associated with a session.

## What this replaces

Removed from scope (D2): archive export, import rehearsal, bulk packages/runner, read-only inspection, source preflight, cross-phase reference ledger, maintenance-mode cutover and reverse-migration procedures. The already-built runtime identity protocols (reservations, account state, graph profiles, login/token/provider coordination) are **kept** and activated in Task 3.1.

## Branch and deploy strategy

- Slices merge into `dev` one at a time (after Checkpoint C1), and dev auto-deploys. During the transition, dev is **hybrid**: migrated subsystems use the graph and the rest use Mongo. Cross-subsystem references are ID strings, so no migration ledger is needed. Each slice switches its subsystem completely (no flag, no fallback). After switching a slice, run `dev:clear`/`dev:seed` on dev.
- **Hold `dev`→`main` promotions** until the user starts the production plan. `main` keeps the current Mongo build. A production hotfix branches from `main` and is cherry-picked back to `dev`.
- Prefer one PR per slice, targeting `dev`, after C1. Keep slices reviewable, at most about 2,000 changed lines excluding generated fixtures.

## File structure (target)

| Path                                                                           | Responsibility                                                                                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `app/server/db/graph/{config,transport,client,identity}.ts`                    | Existing TLS/SASL client and identity tuple; `config` gains runtime-principal validation.                                             |
| `app/server/db/graph/entity-store.ts`                                          | **New.** Revisioned entity CRUD, filtered/paged/text-search listing, edge helpers.                                                    |
| `app/server/db/graph/entity-codec.ts`                                          | **New.** Per-kind zod codec: JSON document, indexed scalar projection, search text.                                                   |
| `app/server/db/graph/memory-entity-store.ts`                                   | **New.** In-memory implementation with identical semantics, for unit tests.                                                           |
| `app/server/db/graph/schema/NNNN-*.groovy` + `scripts/graph/cli.ts`            | Versioned, checksummed domain schema migrations (existing mechanism, extended).                                                       |
| `app/server/db/cql/*`                                                          | Existing control-state store, plus new tables per slice (session numbers, active session, leases, room history).                      |
| `app/server/db/data-runtime.ts`                                                | **New.** Process-wide clients, availability checks, health.                                                                           |
| `app/server/repositories/<domain>/{types,graph,memory?}.ts`                    | Domain interface (no Mongoose types), graph adapter, optional fake.                                                                   |
| `app/server/functions/*.ts`                                                    | Call repositories only (an AST guard forbids model imports).                                                                          |
| `scripts/seed/*.ts`                                                            | **New.** TypeScript seed and clear tooling on repositories (replaces `dev_seed.py`, `dev_clear.py`, `seed-gm.cjs`, `seed_*_data.py`). |
| `tests/contracts/<domain>.contract.ts`                                         | **New.** Shared repository contracts, run against memory in unit tests and against real graph in the Graph foundation workflow.       |
| `e2e/fixtures/data.ts`                                                         | **New.** E2E data helpers on repositories (replaces direct `MongoClient` use in 20 specs and `globalSetup.ts`).                       |
| `realtime/src/history-cassandra.ts`                                            | **New.** `HistoryStore` on Cassandra.                                                                                                 |
| `audio-worker/src/claim-cql.ts`                                                | **New.** Conditional-claim leases on Cassandra.                                                                                       |
| infra `deploy/images/janusgraph/authorization/src/AppTraversalAuthorizer.java` | **New.** Vocabulary policy (replaces `IdentityProfileAuthorizer`).                                                                    |

---

## Phase 0 — Remove migration-only work

### Task 0.1: Delete data-migration tooling (D2)

**Files:**

- Delete:
  - `scripts/identity/{archive,audit,import-source,import-account,import-check-cli,bulk-package,bulk-import,bulk-cli,bulk-contract,cli,import-contract}.ts`, plus their tests under `tests/`;
  - `scripts/mongo-inventory.mjs`, `scripts/migrate-users.cjs`, `scripts/identity/integration.ts`;
  - docs `2026-09-13-identity-{source-preflight,import-rehearsal,bulk-import}.md`.
- Modify:
  - `package.json`: drop the `identity:archive`, `identity:import-check`, `identity:bulk` and `identity:test` scripts;
  - `.github/workflows/graph-foundation.yml`: drop the `identity-archive` job, and remove the bulk/import witnesses from `scripts/cql/local.mjs` and the persistence harness;
  - `scripts/identity/graph-integration.ts`: drop `identityImportContract` and `identityBulkImportContract`;
  - `docs/specs/2026-09-07-janusgraph-cassandra-migration-plan.md`: add a status line that links here.
- Keep: everything under `app/server/repositories/identity/`.

- [ ] **Step 1:** `git grep -nE "import-account|bulk-(import|package|contract)|archive'|import-source|import-check" -- app scripts tests .github package.json` and list every hit.
- [ ] **Step 2:** Delete the files and references. Run `npm run typecheck`. Expected: PASS, with no dangling imports.
- [ ] **Step 3:** Run `npm test`. Expected: PASS; the test file count drops by exactly the deleted test files.
- [ ] **Step 4:** Commit `chore(identity): remove data-migration tooling (no data will be migrated)`.
- [ ] **Step 5:** Ask the user before deleting the private packages under `.local/data/identity*`. They are real dev Mongo copies, and deletion is irreversible.

---

## Phase 1 — Infrastructure (repo `cartyx-infrastructure`, dev only)

Every infra change follows the verified routine from infrastructure PRs #16–#19:

1. Land a policy/test change.
2. Merge; publication runs.
3. Verify the index digests anonymously.
4. Open a pin-promotion PR.
5. Take a dev backup.
6. Merge the pins.
7. Run the live dev checks, then a backup and independent restore.

### Task 1.1: Vocabulary authorizer for one app principal (D4)

**Files:**

- Create: `deploy/images/janusgraph/authorization/src/AppTraversalAuthorizer.java`, `AppTraversalAuthorizationTest.java`
- Modify:
  - `src/IdentityChannelizer.java` → rename it `AppChannelizer.java`, and require `AppTraversalAuthorizer`;
  - `src/IdentityGraphSONSerializer.java`: extend the allowed GraphSON types;
  - `PackPolicy.java`, `dependencies.sha256`, `verify.mjs`, `IDENTITY-POLICY.md` → `APP-POLICY.md`;
  - `deploy/charts/cartyx-data/files/janusgraph-config.groovy`: principal `cartyx_app` from Secret key `gremlin-app-password`, replacing `cartyx_identity`;
  - `deploy/data/{secrets,kubernetes,restore-cluster,security}.mjs` and the chart tests.
- Delete: `IdentityProfileAuthorizer.java`, `profile-requests.json`, `IdentityAuthorizationTest.java` (its channelizer, gate and decoder tests move into the new test).

**Interfaces:**

- Produces: principal `cartyx_app` (runtime) and `cartyx_admin` (operator); Secret key `gremlin-app-password`.

**Policy rules:**

- Allowed for `cartyx_app`: sessionless `bytecode` requests on the `traversal` processor, alias `g→g`, bounded options (existing envelope checks).
- No source instructions.
- Step vocabulary: `V()` with no arguments, `E()` with no arguments, `addV addE property has hasLabel hasNot is where and or not out in both outE inE bothE outV inV otherV values valueMap elementMap properties label id count limit range skip order by dedup fold unfold coalesce constant project select as identity union optional choose repeat times until emit simplePath group groupCount inject sum min max mean drop from to key value tail barrier cap store aggregate local`.
- Predicate tokens: `P` (`eq neq lt lte gt gte inside outside between within without`) and `TextP`/JanusGraph `Text` (`textContains textContainsPrefix textPrefix`).
- Enum tokens: `T`, `Order`, `Scope`, `Column`, `Direction`, `Cardinality`, `Pop`.
- Literals: String (≤1 MiB, valid UTF-16), Int32/Int64/Double/Float, Boolean, `g:Date`, `g:UUID`, null.
- Limits: at most 256 steps in total and nesting depth ≤ 8.
- Denied:
  - lambdas, bindings, strategies, `io`, `call`, `program`, OLAP steps, `math`, `with`, `sack`, `subgraph`, `tree`, `path`, `sideEffect`;
  - any string argument to `addV`/`addE`/`hasLabel` equal to `GraphSchema`;
  - any `property`/`has`/`values` key starting with `graphSchema` or `graphProbe`.
- The pre-authentication gate, MIME guard, compression removal and idle guard from PR #18 are unchanged.

- [ ] **Step 1: Write the failing tests.** In `AppTraversalAuthorizationTest.java`:
  1. Build allowed traversals with the Java `GraphTraversalSource`: `g.V().has("scope",s).has("kind",k).has("entityId",i).elementMap()`, `addV("Location").property(Cardinality.single,"doc","{}")`, `order().by("name",Order.asc)`, `has("searchText", Text.textContains("tavern"))`, `repeat(in("WITHIN")).emit().times(8)`, `drop()`. Assert `authorize()` returns an equal tree.
  2. Assert denial for each forbidden token above, for a source instruction (`g.withComputer()`), for `V(123)`, for label `GraphSchema`, for key `graphSchemaVersion`, for 257 steps, for depth 9, and for scripts (`authorize(user, RequestMessage)` for `cartyx_app`).
  3. Keep the full PR #18 channelizer/gate/decoder protocol suite, but run the real-server requests as `cartyx_app`.
- [ ] **Step 2:** Run `policy-build/run.sh` (the local JDK 11 harness; see handoff) or the Docker build. Expected: FAIL (the class doesn't exist yet).
- [ ] **Step 3:** Implement `AppTraversalAuthorizer`. Recursively walk `Bytecode.getStepInstructions()`, check each operator against a `Set<String>`, and check arguments with a type switch covering `Bytecode`, `P`, `TextP`/`JanusGraphPredicate`, the enums, and literals. Enforce the counters. Return a deep copy rebuilt through `new Bytecode()`, never the client objects. Extend `IdentityGraphSONSerializer.TYPES` with `g:P g:TextP janusgraph:JanusGraphP g:T g:Order g:Scope g:Column g:Direction g:Cardinality g:Pop g:Date g:Float g:Boolean`, keeping lambdas, classes, bindings and strategies rejected.
- [ ] **Step 4:** Run the harness. Expected: PASS. Mutation-check each deny rule by removing it once and watching its test fail.
- [ ] **Step 5:** Update the config, secrets tooling, restore key list, `security.mjs` (app principal: script denied, `g.V().limit(1).count()` **allowed**, `addV('GraphSchema')` denied) and chart tests. Run `node --test deploy/data/tests/*.test.mjs`. Expected: PASS.
- [ ] **Step 6:** PR, publication, digest verification, promotion PR. For dev: provision `gremlin-app-password` with `kubernetes.mjs provision-secret dev` (it adds only missing keys), back up, merge, then run the live checks, backup and restore. Record evidence on the PR.

### Task 1.2: Lucene mixed index (D5)

**Files:**

- Modify:
  - `deploy/images/janusgraph/pom.xml`: add `org.janusgraph:janusgraph-lucene:1.1.0`; resolve transitive CVEs before pinning;
  - `dependencies.sha256`, `verify.mjs`: the Lucene index provider must be loadable;
  - `deploy/charts/cartyx-data/templates/janusgraph.yaml`: add a PVC `cartyx-data-janusgraph-index` (`cartyx-data-retain`, 5Gi dev) mounted at `/var/lib/janusgraph/index`, owned by 999; keep `Recreate`;
  - `files/janusgraph-config.groovy`: `index.search.backend=lucene` and `index.search.directory=/var/lib/janusgraph/index`;
  - `deploy/local/data.compose.yaml`: add a named volume;
  - `deploy/data/restore-cluster.mjs`, `deploy/data/backup-cluster.mjs`: the index is **not** archived; after a restore install, run an operator reindex job (`ManagementSystem.updateIndex(idx, SchemaAction.REINDEX)` for every mixed index), then verify;
  - `deploy/data/README.md`, chart tests.

- [ ] **Step 1:** Add a failing chart test (the index PVC exists, is retained, and is mounted only in JanusGraph). Add a failing `smoke.mjs` case that creates mixed index `infraSearch` on `infraText`, writes "quick brown fox", and asserts `has('infraText', textContains('brown'))` finds it after a JanusGraph restart.
- [ ] **Step 2:** Implement. Run the chart tests and CI data-infrastructure job. Expected: PASS, including the restore-then-reindex search assertion.
- [ ] **Step 3:** Run the same publication/promotion/dev routine as Task 1.1.

### Task 1.3: Application data access in dev

**Files (infra):**

- Modify `deploy/charts/cartyx-data/templates/networkpolicy.yaml`: labelled data clients may also reach Cassandra on 9042 (today only JanusGraph on 8182).
- Modify `deploy/data/kubernetes.mjs`: new action `provision-app-secret <env>` creates Secret `cartyx-app-data` in the same namespace. It copies **only** `gremlin-app-password`, `cassandra-state-password` and `tls.crt` from `cartyx-data`, and refuses to overwrite an existing Secret.
- Modify `deploy/data/network-security.mjs`: a labelled client can reach CQL; an unlabelled pod cannot reach either port.
- Chart tests.

**Files (app repo):**

- Modify `deploy/charts/cartyx/templates/{web,realtime,audio-worker}-deployment.yaml` and `values.yaml`:
  - add the pod label `cartyx.io/data-client: 'true'`;
  - mount `cartyx-app-data` at `/var/run/cartyx-data` (0440);
  - set env `GREMLIN_URL=wss://cartyx-data-janusgraph.<ns>.svc:8182/gremlin`, `GREMLIN_USERNAME=cartyx_app`, `GREMLIN_PASSWORD_FILE`, `GREMLIN_CA_FILE`, `CQL_CONTACT_POINT=cartyx-data-cassandra.<ns>.svc`, `CQL_TLS_SERVER_NAME` (same), `CQL_DATACENTER=dc1`, `CQL_STATE_KEYSPACE`, `CQL_PASSWORD_FILE`, `CQL_CA_FILE`;
  - keep `MONGODB_URI` until Task 3.15;
  - update `deploy/charts/cartyx/tests/render-tests.sh` to assert the label, the mount, the absence of any operator/admin key, and read-only mode.

- [ ] **Step 1:** Write the failing render and network tests. Run `bash deploy/charts/cartyx/tests/render-tests.sh` and the infra tests. Expected: FAIL.
- [ ] **Step 2:** Implement. Expected: PASS.
- [ ] **Step 3:** Dev: run `provision-app-secret dev`, merge infra, then merge the app chart change (C1 permitting). Verify from a web pod: `node -e` TLS connect to 8182 and 9042 succeeds, and an unlabelled debug pod is refused (`network-security.mjs dev`).

---

## Phase 2 — Application foundation (app repo)

### Task 2.1: Runtime data clients and health

**Files:**

- Create: `app/server/db/data-runtime.ts`, `tests/server/db/data-runtime.test.ts`
- Modify:
  - `app/server/db/graph/config.ts`: add an optional `expectUsername` check;
  - `app/server/functions/health.ts` and the `app/routes/readyz.ts` handler: readiness = graph + CQL availability (plus Mongo while any slice remains).

**Interfaces:**

- Produces:
  - `getGraphClient(): ReturnType<typeof createGraphClient>`
  - `getStateStore(): ReturnType<typeof createControlStateStore>`
  - `checkDataReadiness(): Promise<{ graph: boolean; cql: boolean }>`
  - `DataUnavailableError` (maps to 503)

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it, vi } from 'vitest';
import { checkDataReadiness } from '~/server/db/data-runtime';

vi.mock('~/server/db/graph/transport', () => ({
  submitGraphRequest: vi.fn().mockResolvedValue([1]),
}));
vi.mock('~/server/db/cql/client', () => ({
  createCqlClient: () => ({ execute: vi.fn().mockRejectedValue(new Error('down')) }),
}));

describe('checkDataReadiness', () => {
  it('reports each store independently and never throws', async () => {
    await expect(checkDataReadiness()).resolves.toEqual({ graph: true, cql: false });
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/server/db/data-runtime.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement lazy singletons from `readGraphConfig()`/`readCqlConfig('runtime')`. The graph probe is `g.V().has('graphSchemaName','cartyx').limit(1).count()`; the CQL probe is `SELECT release_version FROM system.local`. Wrap each probe in try/catch → boolean, with a 2 s timeout each.
- [ ] **Step 4:** Run the test. Expected: PASS. Run `npm run typecheck`.
- [ ] **Step 5:** Commit `feat(data): runtime graph/CQL clients and readiness`.

### Task 2.2: Entity store (graph) and in-memory twin

**Files:**

- Create:
  - `app/server/db/graph/entity-codec.ts`, `entity-store.ts`, `memory-entity-store.ts`;
  - `tests/contracts/entity-store.contract.ts`, `tests/server/db/entity-store.memory.test.ts`;
  - `scripts/graph/entity-store-integration.ts` (added to the `graph:test` run).
- Modify: `scripts/graph/schema.ts` plus the new migration `app/server/db/graph/schema/0002-entities.groovy`:
  - property keys `doc` (String), `docVersion` (Integer), `revision` (Long, **ConsistencyModifier.LOCK**), `createdAt`/`updatedAt` (Date), `searchText` (String, Lucene mixed index `bySearchText` with `Mapping.TEXT`, plus field `scope` as `Mapping.STRING`);
  - generic indexed scalar keys `ix_s1..ix_s8` (String), `ix_n1..ix_n4` (Long), `ix_b1..ix_b4` (Boolean), `ix_d1..ix_d2` (Date), each in composite indexes together with `scope,kind`;
  - edges get a `position` (Integer) key for ordered relations.

**Interfaces:**

```ts
// entity-codec.ts
export type IndexValue = string | number | boolean | Date | null;
export interface EntityCodec<T> {
  kind: string; // e.g. 'Location'
  version: number; // bump + add upgrade() when the document shape changes
  schema: z.ZodType<T>;
  /** Maps domain fields to generic index slots, e.g. { campaignId: 'ix_s1', isPublic: 'ix_b1' } */
  index: Partial<Record<keyof T & string, `ix_${'s' | 'n' | 'b' | 'd'}${number}`>>;
  searchText?: (value: T) => string;
  upgrade?: (raw: unknown, fromVersion: number) => unknown;
}
// entity-store.ts
export interface EntityRef {
  kind: string;
  scope: EntityScope;
  id: string;
}
export interface Stored<T> {
  ref: EntityRef;
  revision: number;
  value: T;
  createdAt: Date;
  updatedAt: Date;
}
export class StaleRevisionError extends Error {}
export class EntityNotFoundError extends Error {}
export interface ListQuery<T> {
  where?: Partial<Record<keyof T & string, IndexValue | { within: IndexValue[] }>>;
  search?: string; // Lucene textContains over searchText
  orderBy?: { field: keyof T & string; direction: 'asc' | 'desc' };
  limit: number; // 1..500
  offset?: number;
}
export interface EntityStore {
  create<T>(codec: EntityCodec<T>, scope: EntityScope, value: T, id?: string): Promise<Stored<T>>;
  get<T>(codec: EntityCodec<T>, scope: EntityScope, id: string): Promise<Stored<T> | null>;
  getMany<T>(codec: EntityCodec<T>, scope: EntityScope, ids: string[]): Promise<Stored<T>[]>;
  update<T>(
    codec: EntityCodec<T>,
    scope: EntityScope,
    id: string,
    expectedRevision: number,
    next: T
  ): Promise<Stored<T>>; // StaleRevisionError / EntityNotFoundError
  mutate<T>(
    codec: EntityCodec<T>,
    scope: EntityScope,
    id: string,
    change: (current: T) => T,
    attempts?: number
  ): Promise<Stored<T>>; // CAS retry loop, default 3
  remove(codec: EntityCodec<unknown>, scope: EntityScope, id: string): Promise<boolean>; // drops vertex + its edges
  list<T>(codec: EntityCodec<T>, scope: EntityScope, query: ListQuery<T>): Promise<Stored<T>[]>;
  count<T>(
    codec: EntityCodec<T>,
    scope: EntityScope,
    query: Omit<ListQuery<T>, 'limit' | 'offset' | 'orderBy'>
  ): Promise<number>;
  setEdges(from: EntityRef, label: string, to: EntityRef[]): Promise<void>; // replace, preserves order via `position`
  edges(
    ref: EntityRef,
    label: string,
    direction: 'out' | 'in',
    limit: number
  ): Promise<EntityRef[]>;
  traverse(
    start: EntityRef,
    label: string,
    direction: 'out' | 'in',
    maxDepth: number,
    limit: number
  ): Promise<EntityRef[]>; // repeat/emit/simplePath
}
```

- [ ] **Step 1: Write the shared contract** in `tests/contracts/entity-store.contract.ts`. It exports `entityStoreContract(makeStore: () => Promise<EntityStore>)` with these cases:
  - create→get round trip, including nested arrays and Dates;
  - `getMany` preserves requested order and skips missing IDs;
  - `update` with a stale revision throws `StaleRevisionError`;
  - **10 concurrent `mutate` appends to an array all survive** (the lost-update test);
  - `list` with `where`, `within`, `orderBy` and paging;
  - `search` finds words and is scoped to `scope`, so another campaign's entity never appears;
  - `remove` deletes the vertex and its edges;
  - `setEdges` replaces and preserves order;
  - `traverse` returns all descendants to depth 8, terminates on a cycle, and respects `limit`;
  - codec validation rejects invalid values before any write;
  - a Gremlin failure surfaces as `GraphRequestError`, never a partial success.

```ts
export function entityStoreContract(makeStore: () => Promise<EntityStore>) {
  const codec: EntityCodec<{
    name: string;
    campaignId: string;
    tags: string[];
    isPublic: boolean;
  }> = {
    kind: 'ContractThing',
    version: 1,
    schema: z.object({
      name: z.string(),
      campaignId: z.string(),
      tags: z.array(z.string()),
      isPublic: z.boolean(),
    }),
    index: { campaignId: 'ix_s1', isPublic: 'ix_b1', name: 'ix_s2' },
    searchText: (v) => v.name,
  };
  const scope = { type: 'campaign', id: 'a'.repeat(24) } as const;
  it('keeps every concurrent array append', async () => {
    const store = await makeStore();
    const created = await store.create(codec, scope, {
      name: 'x',
      campaignId: scope.id,
      tags: [],
      isPublic: true,
    });
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        store.mutate(
          codec,
          scope,
          created.ref.id,
          (v) => ({ ...v, tags: [...v.tags, `t${i}`] }),
          20
        )
      )
    );
    const final = await store.get(codec, scope, created.ref.id);
    expect(new Set(final!.value.tags).size).toBe(10);
  });
  // …remaining cases as listed above, each a separate it()
}
```

- [ ] **Step 2:** Wire the memory run (`entity-store.memory.test.ts` calls the contract with `createMemoryEntityStore`) and the real run (`scripts/graph/entity-store-integration.ts` runs the same contract through Vitest's `describe` in a node-environment project `graph-contracts`, added to `test.projects` in `vitest.config.ts` (excluded from `npm test`, which runs `--project unit`) and to the Graph foundation workflow after `graph:schema -- apply`). Run `npx vitest run tests/server/db/entity-store.memory.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement the codec, memory store and graph store:
  - **Writes:** a single traversal per operation. Update uses `V().has(identity…).has('revision', expected).property(single,'revision',expected+1).property(single,'doc',…)…`, and an empty result means stale or missing (a follow-up `get` decides which).
  - **Reads:** `elementMap()` → `JSON.parse(doc)` → `codec.upgrade` if `docVersion` < `version` → `schema.parse`.
  - **Search:** `has('searchText', textContains(term))` combined with `has('scope', …)` so Lucene serves both predicates.
- [ ] **Step 4:** Run the memory contract. Expected: PASS. Run the real contract locally (`npm run db:up`; `npm run graph:schema -- apply`; `npx vitest run --project graph-contracts`). Expected: PASS. **If the concurrent-append case fails on JanusGraph** (LOCK on `revision` not serializing), stop and switch `mutate` to a Cassandra control-state revision (existing `control-state.ts`) per entity before continuing. Record the outcome in this document.
- [ ] **Step 5:** Add an AST guard test, `tests/server/no-model-imports.test.ts`. It fails when any file listed in `MIGRATED_FUNCTIONS` (initially empty) imports `db/models/*` or `mongoose`. Each slice appends its files.
- [ ] **Step 6:** Commit `feat(data): revisioned graph entity store with shared contract`.

### Task 2.3: Test and environment tooling skeleton

**Files:**

- Create:
  - `scripts/seed/cli.ts` (`seed`, `clear`, `seed-gm` subcommands, each refusing to run when `NODE_ENV=production`, when the keyspace/URL contains `prod`, or when `R2_BUCKET` contains `prod` — the same guards as `dev_clear.py`);
  - `scripts/seed/registry.ts` (per-subsystem seeders registered in dependency order);
  - `e2e/fixtures/data.ts`.
- Modify:
  - `package.json`: `dev:seed` → `tsx scripts/seed/cli.ts seed && node scripts/gen_seed_*.mjs` (the image generators are ported in their slices), `dev:clear` → `tsx scripts/seed/cli.ts clear`;
  - `.github/workflows/ci.yml` e2e job: add infra checkout at the pinned revision, `npm ci --prefix <infra>/deploy/data`, `npm run db:up`, schema apply, and the GREMLIN_/CQL_ env pointing at the loopback stack. Keep the mongo service until Task 3.15.
  - `deploy/local/deploy-kind.sh`, `deploy/local/e2e-container.sh`, `scripts/dev-all.mjs`: start the data stack, apply the schema, then seed.

- [ ] **Step 1:** Add a failing test `tests/scripts/seed-guards.test.ts` for the three refusal rules. Expected: FAIL.
- [ ] **Step 2:** Implement the CLI with the registry. During the transition, subsystems not yet migrated delegate to the existing Python/CJS seed scripts, which keeps today's behavior.
- [ ] **Step 3:** Run the test. Expected: PASS. Run `npm run dev:clear -- --force && npm run dev:seed` locally; the output matches today's summary.
- [ ] **Step 4:** Commit. Push, and confirm that the CI e2e job starts the graph stack and passes (it's still Mongo-backed for data).

**Checkpoint C1 (user):** approve merging PR #557 (foundation plus trimmed identity code) into `dev`, with `dev`→`main` promotions held. Slices then proceed as separate PRs to `dev`.

---

## Phase 3 — Subsystem slices (dependency order)

### Slice procedure (apply to every task below)

Before starting a slice, write `docs/specs/2026-09-16-dev-graph-<slice>-plan.md` using the writing-plans template. It must contain real code for the repository interface, codecs, contract cases and each function rewrite, based on the code as it exists at that moment. Then:

1. **Inventory.** Every `Model.*` call, `.populate`, text/regex query, aggregate, transaction, index/unique constraint, cascade/cleanup path, seed/fixture/e2e usage and unit test for the slice's models. Record each item → its replacement in the slice plan.
2. **Contract first.** `tests/contracts/<domain>.contract.ts` covers:
   - every repository method;
   - permission-relevant filters (visibility, GM-only fields, campaign isolation, search never leaking another campaign or hidden entities);
   - uniqueness and concurrency invariants;
   - cascade deletes.
     Run it against memory (unit) and real graph (`graph-contracts`). Watch it fail, then implement.
3. **Graph adapter.** Built on `EntityStore` plus the slice's schema migration (new codec slots, edge labels, mixed-index fields if the slice searches). Relationships become edges per the relationship table in the phased plan (e.g. `WITHIN`, `LOCATED_IN`, `ASSOCIATED_WITH`, `MEMBER_OF`, `GIVEN_BY`, `INVOLVES`, `SUBQUEST_OF`, `LINKS_TO`, `TAGGED_WITH`, `REPRESENTS`).
4. **Rewire functions.** Functions call the repository; DTOs stay unchanged. Add the files to `MIGRATED_FUNCTIONS`. Delete the slice's Mongoose models and governance/index registry entries.
5. **Port unit tests.** Replace mongoose mocks with the memory repository (`questTestDb.ts` is the pattern to generalize). The assertions on behavior stay; the mocks go.
6. **Port tooling.** The seeder for this subsystem moves into `scripts/seed/` (same content as `dev_seed.py` produces today); remove the matching Python code. Clear goes through the registry. E2E specs/globalSetup use `e2e/fixtures/data.ts`, and dev-fixtures (`crowded`, `kanka`) use repositories.
7. **Verify.**
   - Commands: `npm test`, `npm run typecheck`, `npm run lint`, the `graph-contracts` project against Docker, the full `npm run e2e` locally against the hybrid stack, and the Storybook tests if UI-adjacent files changed.
   - Push and require all CI jobs green.
   - After merge to dev: `dev:clear`/`dev:seed` on dev, then the slice's manual smoke items.
8. **Commit** in small steps (contract → adapter → function rewire → tests → tooling).

### Task 3.1: Identity and users (`User`)

- **Scope:**
  - activate the kept protocols (`target-login`, `target-reader`, `target-settings`, `target-tokens`, `provider-revocation`, `reservations`, `account-state`, `graph-profiles`, `profile-head`, `audio-prefix`) through `app/server/repositories/identity/index.ts` on `data-runtime`;
  - `requireActor`, OAuth callback/login/logout (`app/server/utils/oauth.ts`, `app/server/functions/auth.ts`);
  - user/admin functions, `seed-gm.cjs` → `scripts/seed/users.ts`.
- **D3 redesign:** `login-admission.ts` domain rows become **per-user** rows keyed `(domain, userId)`, with states `open | revoking | blocked-unresolved`.
  - **Logout:** fence the tokens, set `revoking` (CAS), dispatch the provider revocation once. On a definitive HTTP outcome (success or definitive failure), clear tokens locally and set `open`. On an uncertain outcome (timeout or lost response), stay `blocked-unresolved`, which affects only that user.
  - **Recovery:** an operator command `identity:resolve-revocation <userId>` records the outcome after checking provider state and reopens the row.
  - **Login:** a login for that user is refused while the row is not `open`. Other users are unaffected.
  - **Contract cases:** concurrent login during revocation; logout twice; crash after dispatch; operator resolve; GitHub skip.
- **Mongo exit:** remove `mongo.ts`, `mongo-transaction.ts`, the `User` model and the `identity:graph-schema` profile-only CLI (folded into the schema runner).

### Task 3.2: Campaigns and membership (`Campaign`, membership parts of `Player`)

- **Scope:** `functions/campaigns.ts` (two transactions), `app/server/utils/requireCampaignMember.ts`, `campaignAccessRepository`, `identityMembershipMirror`.
- **Transactions:** campaign create/delete becomes one authoritative control record (`campaign_lifecycle/<id>` in CQL) plus idempotent steps with a resume path. Invite code uniqueness uses a CQL reservation (the existing `reservations.ts` pattern).
- **Model:** membership is a `MEMBER_OF` edge (User→Campaign) with a role property, and is the single authority. Remove the user-side mirror.

### Task 3.3: Tags, location types, locations (`Tag`, `LocationType`, `Location`)

- **Scope:** `functions/{tags,location-types,locations}.ts`.
- **Model:** the parent/child arrays become `WITHIN` edges; children are found by incoming traversal, and cycles are refused on edit. `$text` becomes a Lucene search. Tags become `TAGGED_WITH` edges to campaign-scoped `Tag` vertices.
- **Gallery images:** kept in the document; R2 cleanup paths are unchanged.
- **E2E:** `locations/*`.

### Task 3.4: Players and characters (`Player`, `Character`)

- **Scope:** `functions/{players,characters}.ts`.
- **Model:** character location becomes `LOCATED_IN` (a free-text location stays a document field). The session references (`sessionId`, `sessions`) become `ASSOCIATED_WITH` edges, created against Session vertices in 3.5; until then they stay ID strings in the document.
- **Rules:** player ownership and edit permissions are preserved.
- **Demo:** the "NPCs in town" query (location subtree ∪ `LOCATED_IN`, filtered by visibility) with a contract test.

### Task 3.5: Sessions, session events, notes (`Session`, `SessionEvent`, `Note`)

- **Scope:** `functions/{sessions,session-events,notes,sessionAccess}.ts`.
- **Invariants:**
  - session numbers are allocated through a CQL counter row with CAS;
  - at most one active session per campaign is enforced by a CQL `active_session/<campaignId>` CAS row;
  - event order uses an edge `position`.
- **Relationships:** convert character session references into `ASSOCIATED_WITH` edges with reason/visibility.
- **Demo:** the "NPCs associated with a session" query with a contract test.

### Task 3.6: Organizations (`Organization`, `OrganizationMembership`)

- **Scope:** `functions/organizations.ts`.
- **Model:** a membership becomes a reified `OrganizationMembership` vertex (its ID is preserved for the UI) linked to Organization and Player/Character. Uniqueness uses a CQL reservation.
- **E2E:** `gmscreens-organization-window`.

### Task 3.7: Calendars and events (`Calendar`, `Event`)

- **Scope:** `functions/{calendars,events}.ts`.
- **Model:** parent/linked events and entity links become edges.
- **E2E:** `calendar/*`.

### Task 3.8: Lore (`Lore`)

- **Scope:** `functions/lore.ts`, `app/server/utils/pruneLoreLinks.ts`.
- **Model:** typed references become `LINKS_TO` edges; backlinks use incoming traversal filtered by visibility.
- **E2E:** `lore/*`, `wiki/*`.

### Task 3.9: Quests (`Quest`)

- **Scope:** `functions/quests.ts`, the quest-prune wiring in locations/characters.
- **Model:** `GIVEN_BY`, `INVOLVES`, `SUBQUEST_OF` edges.
- **E2E:** `gmscreens-quest-window`.

### Task 3.10: Reference content (`Race`, `Monster`, `Spell`, `Rule`)

- **Scope:** `functions/{races,monsters,spells,rules,srdImport}.ts`, `seed_monster_data.py`, SRD JSON import.
- **Model:** global versus campaign scope (`EntityScope` global); the SRD import is repeatable and idempotent on deterministic IDs.
- **Search:** Lucene.
- **E2E:** `gmscreens-monster-window`, `tabletop-monster-*`.

### Task 3.11: Maps and map items (`Map`, `MapToken`, `MapText`, `MapDrawing`, `MapAoE`)

- **Scope:** `functions/{maps,mapTokens,mapTexts,mapDrawings,mapAoE}.ts`.
- **Model:** token → entity is a `REPRESENTS` edge; tokens stay independent instances. Group moves use per-token CAS `mutate` in one call, each reported.
- **E2E:** `tabletop/*` measurement/drawing/text/aoe/token specs.

### Task 3.12: GM screens and tabletop (`GMScreen`, `TabletopScreen`, `TabletopPlayerState`)

- **Scope:** `functions/{gmscreens,gmscreens-helpers,tabletop,tabletop-hydration}.ts` (three plus one transactions).
- **Model:** screen/tab order and active map live in revisioned CQL control records (`screen_layout/<id>`), and window references become typed entity refs. Reorder and delete-tab are one CAS on the layout record, followed by idempotent vertex cleanup.
- **E2E:** `tabletop-tabs`, `tabletop-active-map-per-tab`, `tool-windows`, `gmscreens/*`.

### Task 3.13: Chat, dice, realtime history (`Message`, `DiceRoll`, `realtime/src/history.ts`)

- **Scope:** `functions/{chat,diceRolls}.ts`, `realtime/src/{history,index}.ts`.
- **Model:** CQL tables `room_messages` (partition `(room_id, bucket)`, clustering `seq`) and `play_log` for chat/dice. `CassandraHistoryStore` implements `HistoryStore` (`load`, `append`, `deleteUpTo`) with a contract test shared with `MemoryHistoryStore`.
- **Package changes:** remove `mongodb` from `realtime/package.json`, and update realtime's Dockerfile/env.
- **E2E:** `dice-roller`, chat in the tabletop specs.

### Task 3.14: Audio, packages, soundboard, worker (`AudioAsset`, `AudioPackage`, `SoundboardState`, `audio-worker/`)

- **Scope:** `functions/{audio,audio-storage,audio-cleanup,audio-auth,packages,soundboard,uploads}.ts`, `audio-worker/src/{index,claim,process}.ts`.
- **Model:**
  - the graph owns asset/package metadata and links;
  - CQL table `audio_jobs` is authoritative for status, attempts, `next_attempt_at` and lease `generation`, with queue partitions by due minute;
  - `claim-cql.ts` claims via LWT (`UPDATE … IF generation = ?`) and fences heartbeat/retry/reap/terminal writes;
  - quotas use a CQL counter row per owner, with a CAS check before ingest;
  - soundboard state becomes a revisioned CQL record.
- **Tests:** keep and port the concurrent-worker, stale-worker, delete-during-process and crash/replay tests to a real Cassandra contract (`audio-worker` test project plus a CI service job).
- **Package changes:** remove `mongodb` from `audio-worker/package.json`. The worker Dockerfile's ffmpeg assertions are unchanged.
- **E2E:** `audio-library`, `soundboard`.

### Task 3.15: Remaining functions and Mongo removal

- **Scope:** `functions/{cleanup,health,rpc}.ts`, `app/server/db/{connection,bootstrap,governance,inspect,policy}.ts`, `app/server/db/models/`, `scripts/mongo-admin.ts`, `scripts/*.py` (including `seed_calendar_data.py`, `seed_player_data.py`), `scripts/run-python.cjs` (if no longer used), `scripts/repair_seed_images.py`, `scripts/verify_session_seed.py`, the `db:verify`/`db:sync` scripts, `mongoose` in `package.json`, `.env.example`, `docs/`, the CI e2e mongo service and Python setup, and chart `mongodbUri` (secret template, three deployments, render tests, README).
- **Result:** the Definition of done `git grep` is clean.

---

## Phase 4 — Dev cutover verification

### Task 4.1: Full environment and test matrix

- [ ] **Step 1: Fresh-clone local checks.** Run `npm run dev` and use the app, then the full Compose stack, then `deploy/local/deploy-kind.sh`, then `npm run e2e:container`. Each builds data, schema and seed with no Mongo.
- [ ] **Step 2: CI checks.** All workflows are green on the `dev` head: unit, lint, typecheck, Storybook, services, Graph foundation plus all contracts, e2e (graph stack only), Helm.
- [ ] **Step 3: Deployed dev.**
  1. Remove `mongodbUri` from the dev app Secret (infra HelmRelease values/secret process in the `deploying` skill).
  2. Confirm the pods run with no Mongo env.
  3. Run `dev:clear`/`dev:seed` against dev using the dev graph/CQL credentials through the SSH tunnel pattern (`kubectl port-forward` dies on server-closed connections; see the handoff).
  4. Run `security.mjs`, `network-security.mjs dev` and `cql-security dev`.
- [ ] **Step 4: Manual smoke on dev.cartyx.io (seeded GM plus a second player account):**
  - login/logout, including provider revocation and re-login;
  - campaign create/invite/join;
  - location tree edit;
  - NPC-in-town view and session NPC view;
  - wiki search;
  - lore backlinks;
  - quests;
  - SRD browse/search;
  - GM screen windows;
  - tabletop: two browsers, tokens, drawing, AoE, dice, chat reload history;
  - audio upload → transcode → soundboard play;
  - cleanup/delete campaign.
- [ ] **Step 5: Recovery.** Take a dev backup, then an independent restore (reindexing Lucene). Run the full restricted app contract suite against the restored volume; the scratch storage is deleted afterward.
- [ ] **Step 6:** Record the evidence in `2026-09-07-data-infrastructure-progress.md` and the handoff. **Checkpoint C2 (user):** dev is done; open the production discussion.

---

## Test strategy summary

| Layer                                    | Runs against                                           | Where                      |
| ---------------------------------------- | ------------------------------------------------------ | -------------------------- |
| Unit (`npm test`)                        | In-memory repositories implementing the same contracts | local, CI `Lint & Test`    |
| Repository contracts (`graph-contracts`) | Real JanusGraph + Cassandra (Docker, pinned infra)     | local, CI Graph foundation |
| Server policy                            | Real Gremlin Server + TinkerGraph, JanusGraph image CI | infra CI                   |
| Realtime / worker                        | Memory + real Cassandra contracts                      | package CI jobs            |
| E2E (Playwright)                         | Full app on the graph stack, seeded by `scripts/seed`  | CI e2e, `e2e:container`    |
| Live dev                                 | Deployed dev + seed + smoke + backup/restore           | Phase 4                    |

## Risks and mitigations

| Risk                                                                          | Mitigation                                                                                                                                                                  |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JanusGraph lost updates under concurrency                                     | `revision` LOCK plus the concurrent-append contract (Task 2.2). If that fails, use CQL revision records.                                                                    |
| Queries silently needing full scans                                           | `force-index=true` is deployed; contract suites run against real JanusGraph; each slice plan lists every query and its index.                                               |
| Search behaves differently from Mongo `$text`                                 | The contract defines word matching and scope isolation; ranking differences are accepted and documented per slice.                                                          |
| Per-operation connections are slow under load (p50 444 ms at c=50 via tunnel) | Measure in-cluster after Task 1.3; if needed, add a small authenticated connection pool in `transport.ts` with the same deadline and uncertain-write rules (separate task). |
| Hybrid dev during slices                                                      | Each slice switches wholesale; references are ID strings; reseed after each slice.                                                                                          |
| 16k lines of function code                                                    | Strict slice order, a per-slice plan, and the AST guard preventing regressions.                                                                                             |
| Policy vocabulary too narrow for a slice                                      | The slice plan lists the needed steps; infra policy change first (Phase 1 routine).                                                                                         |

## Checkpoints requiring the user

- **C1:** merge PR #557 foundation into `dev` and hold `dev`→`main` promotions.
- **Before deleting** `.local/data/identity*` private packages (Task 0.1 Step 5).
- **C2:** dev complete; start production planning.

## Self-review

- Every decision D1–D5 maps to tasks: D1 → Phase 4 and the branch strategy; D2 → Task 0.1 and the seed tooling; D3 → Task 3.1; D4 → Task 1.1; D5 → Task 1.2 and the search contracts.
- The Definition of done items map to Phase 4 (items 1–4) and Tasks 3.4/3.5 (item 5).
- All 33 models are assigned:
  - User → 3.1; Campaign → 3.2; Tag, LocationType, Location → 3.3; Player, Character → 3.4;
  - Session, SessionEvent, Note → 3.5; Organization, OrganizationMembership → 3.6; Calendar, Event → 3.7;
  - Lore → 3.8; Quest → 3.9; Race, Monster, Spell, Rule → 3.10;
  - Map, MapToken, MapText, MapDrawing, MapAoE → 3.11; GMScreen, TabletopScreen, TabletopPlayerState → 3.12;
  - Message, DiceRoll → 3.13; AudioAsset, AudioPackage, SoundboardState → 3.14.
  - Raw collections (realtime room messages, worker claims) → 3.13 and 3.14.
- Slices intentionally defer code-level detail to per-slice plans written from the code at that moment. The procedure, interfaces and acceptance tests are fixed here.
