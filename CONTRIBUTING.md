# Contributing to Cartyx

## Development Setup

```bash
git clone https://github.com/Cartyx/cartyx-app
cd cartyx-app
npm install
cp .env.example .env   # fill in your credentials
node server.js
```

## Code Quality Standards

This project enforces consistent style via ESLint and Prettier.

### Linting

```bash
npm run lint        # check for issues
npm run lint:fix    # auto-fix issues
```

Rules (see `eslint.config.js`):
- `'use strict'` at the top of every JS file
- `const`/`let` only — no `var`
- `===` always — no `==`
- Unused variables are warnings (prefix with `_` to suppress)

### Formatting

```bash
npm run format      # run Prettier across the codebase
```

Key settings (see `.prettierrc`): single quotes, 2-space indent, trailing commas in ES5 positions, 100-char print width.

## Testing

```bash
npm test                # run all tests
npm run test:watch      # watch mode for TDD
npm run test:coverage   # generate coverage report
npm run test:ci         # used in CI (--ci flag, exits non-zero on failure)
```

Tests live in `tests/`:

```
tests/
  unit/
    models/      # Mongoose schema validation (no DB required)
    utils/       # Pure utility function tests
  integration/   # HTTP-level tests via supertest (no real DB required)
```

**Rule:** unit tests must not require a live MongoDB connection. Use `new Model(data).validateSync()` for schema tests.

## Project Structure

```
src/
  app.js            # Express app factory
  server.js         # Entry point (connects DB, starts server)
  config/           # Config loader and Passport strategies
  controllers/      # Route handlers (auth, campaigns)
  middleware/       # Auth guards, file upload
  models/           # Mongoose schemas
  routes/           # Express routers
  utils/            # Pure helpers
  views/            # EJS templates
    campaigns/      # Campaign-specific pages
    partials/       # Shared fragments (head, topbar)
```

## Pull Request Checklist

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
