# Cartyx — D&D Campaign Management

TanStack Start (React 19) web app + custom Node `ws` realtime service + a Node
`audio-worker` (ffmpeg transcode queue), self-hosted on a single-node k3s cluster
(`z440`) behind a Cloudflare Tunnel. JanusGraph + Cassandra for data (MongoDB was
removed 2026-09; production's own cutover is a separate step), Cloudflare R2 + CDN
for images and audio, self-hosted observability
(GlitchTip/Umami/Grafana — see `docs/observability.md`).

## Commands

- `npm test` — unit suite (`vitest run --project unit`).
- `npm run test:storybook` — story tests in a real browser; needs
  `npx playwright install chromium` once. Also a CI job, alongside
  `build-storybook`. (This used to crash on any invocation — the app's
  nitro/tanstackStart plugins leaked into the Storybook vite config; fixed
  2026-07-28, see `docs/tech-debt.md` item 12.)
- `npm run typecheck` / `npm run lint` — both must be clean (0 errors, 0
  warnings; `lint` runs with `--max-warnings 0`, so any new warning fails CI).
- `bash deploy/charts/cartyx/tests/render-tests.sh` — Helm chart assertions;
  REQUIRED whenever anything under `deploy/charts/` changes (also a CI job).
- `npm run e2e` — Playwright; all inspector tabs (Chat/Dice/Wiki/Notes/Settings)
  render unconditionally — the old `VITE_PUBLIC_FF_*` gating was removed.
- `realtime/` and `audio-worker/` are separate npm packages with their own
  lockfiles and test suites — run `(cd audio-worker && npm run typecheck && npm
test)` for worker changes; the root suite does not cover them. CI's `services`
  job runs both, and also `docker build`s both images (the worker's Dockerfile
  asserts the ffmpeg capabilities the pipeline needs). Both services bundle the
  app's graph modules with esbuild, so their images build from the repo root
  (`docker build -f realtime/Dockerfile .`) and their type checks need the root
  `npm ci` too.
- `deploy/charts/` is prettierignored — don't format it.

## Testing conventions

- Models (`app/server/db/models/`) are graph models with the Mongoose API
  (`defineGraphModel`: find/sort/lean, updateOne operators, upserts, save);
  filters and updates keep MongoDB semantics via mingo, and the shared contracts
  in `tests/contracts/` run both in memory and against real JanusGraph
  (`scripts/graph/repositories-integration.ts`, a CI graph step).
- Most unit tests mock those models per method. That makes them fast, but it
  also means **they cannot catch identity-resolution or query-shape bugs**: a
  mock returns whatever it was told to regardless of what the query actually
  asked for, so handing a query the wrong id (e.g. the OAuth provider id where
  a user's `_id` is required) or dropping a filter clause passes every unit
  assertion. A test can instead run the real model on the in-memory entity
  store (`vi.mock('~/server/repositories/entity-store', () =>
import('./entityStoreDouble'))`). E2E against seeded data is what covers
  those — the audio library's `ownerId` bug (2026-07-28) was green across the
  whole unit suite and caught only by an E2E hitting a real seeded row.
- E2E runs against deliberately fake R2 credentials (`ci.yml`'s e2e job), so
  any server-side outbound R2 call in a user-facing path fails there. Exercise
  new ones locally with those env vars before assuming CI will pass.

## Branching and deploys

- Every PR targets `dev`. NEVER open PRs against `main`.
- Merges auto-deploy: `dev` → dev.cartyx.io, `main` → app.cartyx.io, via
  CI → ghcr images → tag-bump commit to `biozal/cartyx-infrastructure` → Flux.
- Promotion to prod = PR `dev`→`main`, merged with `gh pr merge --merge --admin`
  (main requires a review the author can't self-give; admin merge is repo practice).
- Pipeline debugging, promotion runbook, env-var baking rules: use the
  `deploying` skill in `.claude/skills/`.

## Dependencies

- New/updated npm packages must be published ≥7 days (house rule) AND pass
  `npm run check:deps-age` (10-day cooldown). Dependabot is configured for
  weekly grouped minor/patch PRs.
- `@tanstack/react-router` and `@tanstack/react-start` are LOCKSTEP-pinned —
  bump together or the SSR build breaks. Dependabot ignores them; manual only.

## Telemetry conventions

- Client: `captureException`/`captureEvent` from `~/utils/telemetry-client`
  (errors → GlitchTip via Sentry SDK, events → Umami). Server:
  `serverCaptureException`/`serverCaptureEvent` from `~/server/utils/telemetry`.
- All wrappers are safe no-ops when their env vars are absent (local dev, CI).
  Never `await` capture calls on request-critical paths.
- Server→Umami POSTs must keep the browser-style User-Agent constant in
  `app/server/utils/telemetry.ts` — Umami's isbot filter silently discards
  bot-looking UAs (HTTP 200, event dropped).
- Platform operations (credentials, alerts, backups, gotchas): use the
  `platform-ops` skill in `.claude/skills/`.

## Environments and credentials

- TWO of everything per environment — Google/GitHub OAuth clients, GlitchTip
  DSNs, Umami website IDs. The laptop `.env` holds DEV values; never copy
  `.env` OAuth/R2/data values into prod config.
- Cluster access: `export KUBECONFIG=~/.kube/cartyx.yaml`. The `flux` CLI is
  not installed — see the `deploying` skill for the kubectl reconcile pattern.
