# Cartyx ⚔️

D&D Campaign Management Platform — organize sessions, manage players, and run your tabletop world.

Built with TanStack Start, React, and a retro pixel-art aesthetic.

## Quick Start

```bash
npm install
cp .env.example .env   # fill in OAuth credentials and MongoDB URI
npm run dev            # http://localhost:3000 (Vite dev server)
```

For production:

```bash
npm run build
npm start              # http://localhost:3001
```

## Features

- **OAuth Authentication** — Google, GitHub, Apple Sign-In (via JOSE/JWT)
- **Campaign Management** — Create, edit, and manage D&D campaigns
- **Player Invites** — Share invite codes for players to join
- **Session Scheduling** — Weekly/bi-weekly/monthly with timezone support and Day.js formatting
- **Access Control** — GM and player roles with owner-only actions
- **Product Analytics** — PostHog integration for usage insights

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [TanStack Start](https://tanstack.com/start) (full-stack React) |
| **UI** | React 19 + [Tailwind CSS v4](https://tailwindcss.com) |
| **Routing** | [TanStack Router](https://tanstack.com/router) (file-based, type-safe) |
| **Auth** | Custom OAuth (Google, GitHub, Apple) via [JOSE](https://github.com/panva/jose) JWT |
| **Database** | MongoDB ([Mongoose](https://mongoosejs.com)) |
| **Dates** | [Day.js](https://day.js.org) with timezone + relative time plugins |
| **Analytics** | [PostHog](https://posthog.com) (React SDK) |
| **Build** | [Vite](https://vitejs.dev) |
| **Testing** | [Vitest](https://vitest.dev) + [React Testing Library](https://testing-library.com) |
| **Linting** | ESLint (flat config) + Prettier |
| **Hosting** | Nginx reverse proxy + PM2 on Linux |

## Project Structure

```
app/
  client.tsx              # Client entry point
  router.tsx              # TanStack Router config
  server.ts               # Server entry (TanStack Start handler)
  routeTree.gen.ts        # Auto-generated route tree
  styles/
    globals.css           # Tailwind + global styles
  components/
    Toast.tsx             # Toast notification system
    Topbar.tsx            # Navigation bar
  hooks/
    useAuth.ts            # Authentication hook
    useCampaigns.ts       # Campaign mutation hooks
  providers/
    AuthProvider.tsx       # Auth context provider
    PostHogProvider.tsx    # Analytics provider
  constants/
    timezones.ts          # Timezone list for scheduling
  utils/
    date.ts               # Day.js date formatting utilities
    helpers.ts            # Client-side helpers
  routes/
    __root.tsx            # Root layout
    index.tsx             # Landing page
    dashboard.tsx         # User dashboard
    auth/
      $provider.tsx       # OAuth initiation
      callback/
        $provider.tsx     # OAuth callback handler
      logout.tsx          # Logout
    campaigns/
      index.tsx           # Campaign list grid
      new.tsx             # Campaign creation wizard
      $campaignId/
        summary.tsx       # Campaign detail view
        edit.tsx          # Campaign editor
  server/
    session.ts            # JWT session management
    middleware/
      auth.ts             # Auth middleware
    db/
      connection.ts       # MongoDB connection
      models/
        User.ts           # User schema
        Campaign.ts       # Campaign schema
    functions/
      auth.ts             # Auth server functions
      campaigns.ts        # Campaign CRUD server functions
    utils/
      helpers.ts          # Server utilities (invite codes, file upload, etc.)
      oauth.ts            # OAuth provider implementations
      posthog.ts          # Server-side analytics

prod-server.js            # Production HTTP server wrapper
tests/
  setup.ts                # Vitest setup
  components/             # Component tests
  routes/                 # Route-level tests
  server/
    functions/            # Server function tests
    utils/                # Server utility tests
  utils/                  # Client utility tests (e.g. date.ts)

.github/
  workflows/
    ci.yml                # PR checks: typecheck → lint → test → build
    deploy-linus.yml      # Production deploy to self-hosted runner
  dependabot.yml          # Automated dependency updates
```

## Development

```bash
npm run dev            # Vite dev server with HMR
npm run build          # Production build
npm start              # Start production server
npm run typecheck      # TypeScript type checking
npm run lint           # ESLint check
npm run lint:fix       # Auto-fix lint issues
npm run format         # Prettier format
npm test               # Run tests (Vitest)
npm run test:watch     # TDD watch mode
npm run test:coverage  # Coverage report
```

## Code Quality

- **TypeScript** — Strict mode, full type coverage
- **ESLint** (flat config) — React hooks rules, TypeScript rules
- **Prettier** — Single quotes, 2-space indent, 100-char lines
- **Vitest** — Unit + component + server function tests
- **React Compiler** — Babel plugin for automatic memoization
- See [CONTRIBUTING.md](CONTRIBUTING.md) for full standards and PR checklist

## CI/CD

Every pull request runs the **CI** workflow (`ci.yml`):
1. Type check (`npm run typecheck`)
2. Lint (`npm run lint`)
3. Test with coverage (`npm run test:ci`)
4. Production build (`npm run build`)

Merging to `main` triggers the **Deploy** workflow (`deploy-linus.yml`):
1. Lint + type check + test (fail fast)
2. Production build
3. Rsync to `/var/www/cartyx-app` on the self-hosted runner
4. Install production dependencies (`npm ci --omit=dev`)
5. Symlink `.env` and `keys/` from `/var/www/cartyx-auth/`
6. Restart via PM2 (`prod-server.js`)
7. Health check (HTTP 200 on `localhost:3001`)

The deploy workflow **does not** copy `.env` or `keys/` — those live in a secure location on the server and are symlinked automatically.

## Deployment — First-Time Server Setup

```bash
# 1. Pre-provision the deploy directory:
sudo mkdir -p /var/www/cartyx-app
sudo chown "$(id -un):$(id -gn)" /var/www/cartyx-app

# 2. Create the secure config directory:
sudo mkdir -p /var/www/cartyx-auth/keys
sudo chown -R "$(id -un):$(id -gn)" /var/www/cartyx-auth

# 3. Create your .env file:
cp .env.example /var/www/cartyx-auth/.env
# Edit with your OAuth credentials, MongoDB URI, etc.
# IMPORTANT: Set NODE_ENV=production and use a strong SESSION_SECRET.

# 4. Place your Apple Sign-In key:
cp /path/to/your/apple.p8 /var/www/cartyx-auth/keys/apple.p8

# 5. Configure nginx to proxy to the Node app:
# Point your server block to proxy_pass http://127.0.0.1:3001
sudo nginx -t && sudo systemctl reload nginx

# 6. Set up a GitHub Actions self-hosted runner:
#    https://github.com/Cartyx/cartyx-app/settings/actions/runners/new
./scripts/setup-runner.sh
```

## Environment Variables

See [`.env.example`](.env.example) for all required configuration.

## License

MIT — see [LICENSE](LICENSE)
