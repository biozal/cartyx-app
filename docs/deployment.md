# Deployment Guide

Cartyx is self-hosted on a single-node k3s cluster (`z440`, home lab) behind a
Cloudflare Tunnel. GitOps end to end: merges deploy automatically, no cluster
credentials outside the box.

> Historical note: earlier revisions of this document described the
> Vercel + PartyKit deployment. That platform was fully decommissioned in
> July 2026 (self-host migration Phases 1–5 — see
> `docs/specs/2026-07-07-selfhost-migration-roadmap.md`).

## Architecture

```
browser ── Cloudflare edge (TLS, apex 301 → app) ── Cloudflare Tunnel
             │                                          │
   R2 + CDN (images + audio, cdn.cartyx.io)      cloudflared pods
             │                                          │
             │                                Traefik (k3s, websecure)
             │                                 │                  │
             │                          cartyx-web (SSR)   cartyx-realtime (ws)
             │                                 │                  │
             └── cartyx-audio-worker ──── JanusGraph + Cassandra (cartyx-data chart,
                 (no port; polls the queue)       per-env keyspaces, in-cluster TLS)
```

- **Environments:** namespace `dev` → dev.cartyx.io / dev-ws.cartyx.io;
  namespace `prod` → app.cartyx.io / ws.cartyx.io. Everything exists twice —
  data keyspaces, OAuth clients, R2 bucket, GlitchTip project, Umami website.
  (Production runs the pre-graph release on MongoDB Atlas until its own
  cutover; a release from `dev` needs that cutover before it can deploy there —
  the chart refuses to render without the data stores.)
- **Image uploads:** the browser PUTs directly to R2 via a presigned URL (the
  server only signs); local dev without `CDN_URL` falls back to a server-side
  path under `public/uploads/`.
- **Audio uploads:** same presigned PUT, then `cartyx-audio-worker` claims the
  row and transcodes to Opus + AAC with ffmpeg. Every audio object lives under
  `uploads/audio/<per-user random prefix>/`, which is what makes the in-app
  "Reclaim orphaned files" scan owner-scoped — see
  `app/server/functions/audio-storage.ts`.
- **Observability platform** (Grafana/GlitchTip/Umami/VictoriaLogs/-Metrics)
  runs in namespace `platform` — see `docs/observability.md`.

## How deploys work

1. Merge a PR to `dev` (all PRs target `dev`; promotion to prod is a
   `dev`→`main` PR merged with `gh pr merge --merge --admin`).
2. `.github/workflows/deploy.yml` builds and pushes
   `ghcr.io/biozal/cartyx-{web,realtime,audio-worker}` images. Client-baked
   `VITE_PUBLIC_*` values come from `deploy/build/web-<env>.args` — changing
   one requires a rebuild, not a values change. The realtime and audio-worker
   images are built BEFORE the web image, so a broken Dockerfile in either
   fails the job before web is ever pushed — which is why CI's `services` job
   `docker build`s the worker on every PR.
3. CI commits the new image tags to
   [biozal/cartyx-infrastructure](https://github.com/biozal/cartyx-infrastructure)
   (`apps/<env>/helmrelease.yaml`). Three services, three marker comments the
   sed anchors on — `# ci:web-tag`, `# ci:realtime-tag`,
   `# ci:audioworker-tag`. The step greps for all three first and fails loudly
   if one is missing, because a missing marker makes its sed a silent no-op and
   the "tags unchanged" early exit would then report success forever.
4. Flux on the cluster reconciles within about a minute and rolls the pods.

Operational details (stall diagnosis, forced reconciles, promotion runbook,
the transient ghcr `unknown blob` failure): `.claude/skills/deploying/SKILL.md`.
Chart internals and render tests: `deploy/charts/cartyx/README.md`.
Cluster-side manifests, tunnel, certificates, platform stack:
the cartyx-infrastructure README.

## One-time provisioning

Everything below already exists for cartyx.io; kept as the runbook for
standing up a new environment from zero.

### Data stores (JanusGraph + Cassandra)

Provisioned by the `cartyx-data` chart in `biozal/cartyx-infrastructure`, one
state keyspace per environment. That repo's runbook covers credentials
(`kubernetes.mjs provision-app-secret <env>` creates the `cartyx-app-data`
Secret the app mounts), schema installation (`npm run graph:schema -- apply`,
`npm run identity:graph-schema -- apply`, `npm run db:schema`), backups and
restores. The app chart sets `data.cql.stateKeyspace` per environment.

### OAuth (two clients per provider)

Google and GitHub each need separate prod and dev OAuth apps — GitHub apps
allow only ONE callback host each:

- prod: callbacks on `app.cartyx.io` (`/auth/callback/google`,
  `/auth/callback/github`)
- dev: callbacks on `dev.cartyx.io` (+ `http://localhost:3000` on Google for
  local dev)

Never put dev client IDs/secrets in prod config; the client IDs live in
chart values, the secrets in the per-namespace `cartyx` Secret.

### Cloudflare: DNS, Tunnel, R2

- **Domain** on Cloudflare (free plan). App hostnames are proxied CNAMEs to
  the tunnel (`<tunnel-id>.cfargotunnel.com`); tunnel Public Hostname
  entries route each host to Traefik with per-host Origin Server Name. The
  apex `cartyx.io` is a proxied placeholder A record (192.0.2.1) plus a
  Single Redirect rule 301ing to `https://app.cartyx.io` preserving
  path and query.
- **R2 buckets** `cartyx-production` + `cartyx-dev` with custom domains
  `cdn.cartyx.io` / `cdn-dev.cartyx.io` (proxied). CORS: allow `PUT` from
  the matching app origin (+ localhost:3000 for dev), headers
  `Content-Type`, expose `ETag`. One Object Read & Write API token scoped to
  both buckets → per-namespace Secret.
- **Rate limiting**: one rule caps POST `/api/*` on
  umami/glitchtip.cartyx.io at 50 req/10 s per IP (public ingest endpoints).
- A private `cartyx-backups` bucket holds nightly platform Postgres dumps
  (no custom domain, never public).

### Cluster secrets (out-of-band, never in git)

One Secret `cartyx` per app namespace: `sessionSecret` (≥32 chars), OAuth
secrets, R2 keys. Data-store credentials are the separate `cartyx-app-data`
Secret (above). Created with
`kubectl create secret generic` per `deploy/charts/cartyx/README.md`.
Rotation = `kubectl patch` + rollout restart (the chart's `existingSecret`
bypasses checksum auto-restart). Platform-namespace secrets: see
`docs/observability.md` and the infra README.

## Environment variables

`.env.example` is the authoritative reference. The split that matters:

| Kind                      | Examples                                                                                 | Changed by                                                |
| ------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Client-baked (build-time) | `VITE_PUBLIC_GLITCHTIP_DSN`, `VITE_PUBLIC_UMAMI_WEBSITE_ID`, `VITE_PUBLIC_PARTYKIT_HOST` | `deploy/build/web-<env>.args` + merge (CI rebuilds image) |
| Server runtime (plain)    | `APP_ENV`, `GLITCHTIP_DSN`, `UMAMI_WEBSITE_ID`, `CDN_URL`, `REALTIME_INTERNAL_HOST`      | chart `values-<env>.yaml` + merge (Flux rolls)            |
| Server runtime (secret)   | `SESSION_SECRET`, OAuth/R2 secrets; data credentials (`cartyx-app-data`)                 | `kubectl patch` Secret + rollout restart                  |

## Troubleshooting

- **Merged but the site is unchanged** → work the pipeline stages with the
  `deploying` skill; most common causes are a failed image push (rerun the
  failed job) or Flux not yet reconciled (force with the kubectl annotate
  pattern — the `flux` CLI is not installed on the laptop).
- **Every request 503s / `/readyz` fails** → the graph or Cassandra probe is
  failing: check the `cartyx-data` pods, the `cartyx-app-data` Secret, and that
  the schemas were applied for this environment's keyspace.
- **Images don't display** → `CDN_URL` must match the R2 custom domain; check
  the custom domain is active in Cloudflare R2 settings.
- **WebSockets dead in containers but fine locally** → set
  `REALTIME_INTERNAL_HOST` (server→realtime broadcasts can't use the
  browser-facing host inside the cluster).
- **Audio stuck `pending`/`processing`** → it's the worker, not web:
  `kubectl -n <env> logs deploy/cartyx-audio-worker`. To stop it transcoding
  immediately, `kubectl -n <env> scale deploy/cartyx-audio-worker
--replicas=0` — but note the next `helm upgrade` silently undoes that; the
  durable pause is `audioWorker.replicaCount: 0` in the infra repo. Both are
  written up in `deploy/charts/cartyx/README.md` under Operations.
