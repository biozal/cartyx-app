# Code Quality Review & Recommendations

**Date:** 2026-04-05

---

## 1. Lint Warnings — Fix Plan

All 7 current warnings, all safe to fix with no behavior changes:

| #   | File                                       | Line | Rule              | Fix                                                                                                      |
| --- | ------------------------------------------ | ---- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | `app/server/db/models/Character.ts`        | 52   | `no-explicit-any` | Suppressed via ESLint config (`no-explicit-any` off for `app/server/**`) — Mongoose requires `any` casts |
| 2   | `app/server/db/models/Character.ts`        | 68   | `no-explicit-any` | Same as above                                                                                            |
| 3   | `app/server/db/models/GMScreen.ts`         | 3    | `no-unused-vars`  | Remove unused `WindowState` import                                                                       |
| 4   | `app/server/db/models/Note.ts`             | 33   | `no-explicit-any` | Suppressed via ESLint config (same as #1)                                                                |
| 5   | `app/server/db/models/Note.ts`             | 49   | `no-explicit-any` | Same as above                                                                                            |
| 6   | `tests/routes/campaigns-sessions.test.tsx` | 80   | `no-unused-vars`  | Destructure as `icon: _icon` to preserve real prop name                                                  |
| 7   | `tests/server/db/bootstrap.test.ts`        | 396  | `no-console`      | Add `// eslint-disable-next-line no-console`                                                             |

---

## 2. React & TanStack Best Practices Review

### Critical

**Over-Invalidation in TanStack Query** — Mutations invalidate `queryKeys.*.all` which refetches everything. Should invalidate specific list/detail keys instead. Affects: `useNotes`, `useCharacters`, `useCampaigns`, `useSessions`.

### High Impact

**Large Component Files** — `GMScreensView.tsx` (692 lines), `CharacterModal.tsx` (540 lines) should be split into sub-components.

**Query Key Structure** — Filter params passed as positional optionals with empty-string defaults. Should use a filter object for cleaner cache key matching and easier invalidation.

**Stale Time Configuration** — Global 2min staleTime is one-size-fits-all. Detail queries should be longer (10min), list queries shorter (30s).

### Medium Impact

**Mutation Error Handling** — All hooks wrap `mutateAsync` in try/catch returning `null`, which swallows errors. Components can't distinguish "no result" from "error".

**Missing `useCallback`/`useMemo`** — Several handler functions and computed values in render path aren't memoized (e.g., `TagAutocompleteInput` suggestion filtering).

**Duplicate CRUD Hook Patterns** — `useNotes`, `useCharacters`, `useCampaigns` are 150+ lines of near-identical code. Could extract a generic hook factory.

### Positive Findings

- Server function patterns are consistent and well-structured
- Error boundary at root is solid
- Accessibility patterns (ARIA, semantic HTML) are good
- Portal usage for modals is correct
- Event listener cleanup is thorough

---

## 3. React Compiler

### Status

React Compiler 1.0 shipped stable October 2025. **This project already has it configured** (`babel-plugin-react-compiler` `^1.0.0` in package.json).

### Recommendation: Monitor, Don't Rely On

**There is an open bug with TanStack Query** ([facebook/react#34211](https://github.com/facebook/react/issues/34211), [TanStack/query#9571](https://github.com/TanStack/query/issues/9571)): the compiler breaks Query's referential stability guarantees, causing _more_ re-renders instead of fewer. TanStack Table and TanStack Form also have open incompatibilities.

**Action items:**

1. ~~Add `customViteReactPlugin: true` to `tanstackStart()` options~~ — Not needed: current TanStack Start version (1.167.16) doesn't recognize this option and doesn't inject a conflicting React plugin
2. ~~Upgrade from RC to stable 1.0 release~~ — Done: upgraded `babel-plugin-react-compiler` to `^1.0.0`
3. ~~Add `eslint-plugin-react-compiler` to catch code the compiler silently bails on~~ — Done
4. Don't remove manual `useMemo`/`useCallback` yet — keep them until the TanStack Query issue is resolved

---

## 4. Code Quality Tools

### Critical Fix

**CI doesn't run on PRs to `dev`** — The workflow triggers on `branches: [main]` but all PRs target `dev`. Most PRs have zero CI coverage. Change to `branches: [main, dev]`.

### Tier 1 — Do This Week (high value, easy effort)

| Tool                                             | What                                          | Effort              |
| ------------------------------------------------ | --------------------------------------------- | ------------------- |
| Fix CI trigger for `dev` branch                  | Change one line in `.github/workflows/ci.yml` | 1 min               |
| `npm audit --audit-level=high` in CI             | Add one step to ci.yml                        | 5 min               |
| `@tanstack/eslint-plugin-query`                  | Validates Query usage, catches real bugs      | 15 min              |
| `eslint-plugin-react-compiler`                   | Catches code the compiler can't optimize      | 15 min              |
| `noUncheckedIndexedAccess` in tsconfig           | Forces `T \| undefined` on index access       | 30 min (fix errors) |
| `forceConsistentCasingInFileImports` in tsconfig | Prevents macOS/Linux path mismatches          | 5 min               |

### Tier 2 — Do This Month (high value, medium effort)

| Tool                               | What                                                               | Effort |
| ---------------------------------- | ------------------------------------------------------------------ | ------ |
| Lefthook                           | Pre-commit hooks: lint + format on staged files, tests on pre-push | 1 hour |
| `eslint-plugin-jsx-a11y`           | Accessibility linting                                              | 30 min |
| `actions/dependency-review-action` | Scan PR deps for vulnerabilities                                   | 15 min |
| `npx vite-bundle-visualizer`       | One-time bundle audit                                              | 5 min  |

### Tier 3 — When Convenient

| Tool                        | What                                              | Effort  |
| --------------------------- | ------------------------------------------------- | ------- |
| `eslint-plugin-import-x`    | Circular dependency detection                     | 1 hour  |
| size-limit / bundlewatch    | Bundle size budgets in CI                         | 2 hours |
| Codecov / Coveralls         | PR coverage comments                              | 1 hour  |
| `eslint-plugin-tailwindcss` | Validate Tailwind classes (check v4 compat first) | 1 hour  |
