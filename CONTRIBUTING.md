# Contributing to Cartyx

## Development Setup

```bash
git clone https://github.com/biozal/cartyx-app
cd cartyx-app
npm install
cp .env.example .env   # fill in your credentials
npm run dev            # http://localhost:3000
```

## Code Quality Standards

This project enforces consistent style via TypeScript, ESLint, and Prettier.

### Type Checking

```bash
npm run typecheck      # TypeScript strict mode
```

All code is TypeScript. Server functions, components, and utilities must be fully typed.

### Linting

```bash
npm run lint        # check for issues
npm run lint:fix    # auto-fix issues
```

Rules (see `eslint.config.js`):
- React hooks rules enforced
- TypeScript-specific rules via `@typescript-eslint`
- Unused variables are warnings (prefix with `_` to suppress)

### Formatting

```bash
npm run format      # run Prettier across the codebase
```

Key settings (see `.prettierrc`): single quotes, 2-space indent, trailing commas in ES5 positions, 100-char print width.

## Testing

```bash
npm test                # run all tests (Vitest)
npm run test:watch      # watch mode for TDD
npm run test:coverage   # generate coverage report
npm run test:ci         # used in CI (verbose + coverage)
```

Tests live in `tests/`:

```
tests/
  setup.ts               # Vitest global setup
  components/            # React component tests (Testing Library)
  routes/                # Route-level tests (schemas, server fns)
  server/
    functions/           # Server function tests
    utils/               # Server utility tests
  utils/                 # Client utility tests
```

**Rule:** Unit tests must not require a live MongoDB connection. Mock database calls where needed.

## Project Structure

See [README.md](README.md#project-structure) for the full directory layout.

### Key Patterns

- **Server Functions:** Use `createServerFn` from TanStack Start for type-safe RPC between client and server
- **File-Based Routing:** Routes live in `app/routes/` and are auto-generated into `app/routeTree.gen.ts`
- **Auth:** JWT sessions via JOSE (no Passport.js). OAuth flows are custom-implemented in `app/server/utils/oauth.ts`
- **Date Formatting:** Use `app/utils/date.ts` (Day.js) for all date/time display. Never use raw `Date` on the client side.

## Pull Request Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes with no errors
- [ ] `npm test` passes
- [ ] New features include tests
- [ ] No secrets committed (check `.env`, `keys/`)
- [ ] PR title is descriptive (e.g. `feat: add campaign invite flow`)

## Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add invite code join flow
fix: correct session expiry calculation
chore: update dependencies
docs: improve README setup guide
test: add Campaign schema validation tests
refactor: extract campaign helpers
```

## Branch Naming

Use prefixes that match the work type:

```
feature/issue-10-dayjs
fix/session-expiry-bug
chore/update-deps
docs/readme-update
```
