# Cartyx ⚔️

D&D Campaign Management Platform — organize sessions, manage players, and run your tabletop world.

## Quick Start

```bash
npm install
cp .env.example .env   # fill in OAuth credentials and MongoDB URI
npm start              # http://localhost:3001
```

## Features

- **OAuth Authentication** — Google, GitHub, Apple Sign-In
- **Campaign Management** — Create, edit, and manage D&D campaigns
- **Player Invites** — Share invite codes for players to join
- **Session Scheduling** — Weekly/bi-weekly/monthly with timezone support

## Tech Stack

- **Runtime:** Node.js + Express
- **Views:** EJS server-rendered templates
- **Auth:** Passport.js (Google, GitHub, Apple)
- **Database:** MongoDB Atlas (Mongoose)
- **Analytics:** PostHog (server-side + client-side)
- **Hosting:** Nginx reverse proxy on Linux, PM2 process manager

## Project Structure

```
server.js               # Thin entry — delegates to src/server.js
src/
  app.js                # Express app (middleware, routes, view engine)
  server.js             # DB connection + server start + graceful shutdown
  config/
    index.js            # Centralised config from env vars
    passport.js         # OAuth strategy setup
    posthog.js          # PostHog server-side client init + shutdown
  controllers/
    authController.js   # OAuth callbacks, logout, token refresh
    campaignController.js # Campaign CRUD, dashboard, API
  middleware/
    auth.js             # Session setup, isAuthenticated guard
    upload.js           # Multer file upload config
  models/
    User.js             # Mongoose User schema
    Campaign.js         # Mongoose Campaign schema
  routes/
    index.js            # / and /login (static) + /dashboard
    auth.js             # /auth/* OAuth endpoints
    campaigns.js        # /campaigns/* UI routes
    api.js              # /api/* JSON endpoints
  utils/
    helpers.js          # escapeHtml, providerConfigured, generateInviteCode, upsertUser
  views/
    dashboard.ejs       # Session debug page
    campaigns/
      list.ejs          # Campaign grid
      new.ejs           # 5-step creation wizard
      editor.ejs        # Edit existing campaign
      summary.ejs       # Campaign detail + invite code
    partials/
      head.ejs          # Meta/fonts
      topbar.ejs        # Navigation bar
      topbar-css.ejs    # Topbar styles
      topbar-js.ejs     # Topbar scripts
public/                 # Static assets (logos, CSS, uploads)
tests/
  unit/
    models/             # Schema validation tests (no DB)
    utils/              # Pure utility function tests
  integration/          # HTTP-level tests via supertest
scripts/                # One-off utilities (seed, migrate, runner setup)
.github/
  workflows/
    ci.yml              # PR checks: lint + test
    deploy-linus.yml    # Production deploy (lint → test → deploy)
  dependabot.yml        # Automated dependency updates
```

## Development

```bash
npm run dev          # node --watch (auto-restart on file changes)
npm run lint         # ESLint check
npm run lint:fix     # Auto-fix lint issues
npm run format       # Prettier format
npm test             # Run tests
npm run test:watch   # TDD watch mode
npm run test:coverage # Coverage report
```

## Code Quality

- **ESLint** (flat config, `eslint.config.js`) — enforces `'use strict'`, no `var`, strict equality
- **Prettier** (`.prettierrc`) — single quotes, 2-space indent, 100-char lines
- **Jest** (`jest.config.js`) — unit + integration tests, coverage reporting
- See [CONTRIBUTING.md](CONTRIBUTING.md) for full standards and PR checklist

## CI/CD

Every pull request runs the **CI** workflow (`ci.yml`):
1. Install dependencies (`npm ci`)
2. Lint (`npm run lint`)
3. Test (`npm run test:ci`)

Merging to `main` triggers the **Deploy** workflow (`deploy-linus.yml`):
1. Lint + test (same checks, fail fast)
2. Rsync files to `/var/www/cartyx-app` on the production server
3. Install production dependencies (`npm ci --omit=dev`)
4. Symlink `.env` and `keys/` from `/var/www/cartyx-auth/`
5. Restart via PM2
6. Health check (HTTP 200 on `localhost:3001`)
7. Verify nginx config

The deploy workflow **does not** copy `.env` or `keys/` — those live in a secure location on the server and are symlinked automatically.

## Deployment — First-Time Server Setup

```bash
# 1. Pre-provision the deploy directory (owned by the runner user):
sudo mkdir -p /var/www/cartyx-app
sudo chown "$(id -un):$(id -gn)" /var/www/cartyx-app

# 2. Create the secure config directory on the server:
sudo mkdir -p /var/www/cartyx-auth/keys
sudo chown -R "$(id -un):$(id -gn)" /var/www/cartyx-auth

# 3. Create your .env file in the secure config directory:
cp .env.example /var/www/cartyx-auth/.env
# Edit with your OAuth credentials, MongoDB URI, etc.
# IMPORTANT: Set NODE_ENV=production and use a strong SESSION_SECRET.

# 4. Place your Apple Sign-In key in the secure keys directory:
cp /path/to/your/apple.p8 /var/www/cartyx-auth/keys/apple.p8

# 5. Get a runner token from:
#    https://github.com/Cartyx/cartyx-app/settings/actions/runners/new

# 6. Run the setup script (as a regular user, NOT root):
./scripts/setup-runner.sh

# 7. Update nginx to serve from /var/www/cartyx-app/public.
#    The deploy workflow verifies nginx config but does NOT modify it.
sudo nginx -t && sudo systemctl reload nginx
```

## Environment Variables

See [`.env.example`](.env.example) for all required configuration.

Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `SESSION_SECRET` | Yes (prod) | Session encryption key |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth secret |
| `GITHUB_CLIENT_ID` | No | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | No | GitHub OAuth secret |
| `VITE_PUBLIC_POSTHOG_KEY` | No | PostHog project API key |
| `VITE_PUBLIC_POSTHOG_HOST` | No | PostHog instance URL (default: `https://us.i.posthog.com`) |

## License

MIT — see [LICENSE](LICENSE)
