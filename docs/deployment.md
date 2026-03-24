# Deployment Guide

Complete guide to setting up Cartyx infrastructure from scratch.

## Architecture Overview

```
                    ┌─────────────────────────────────────┐
                    │           Cloudflare DNS             │
                    │  app.cartyx.io → Vercel (prod)       │
                    │  dev.cartyx.io → Vercel (dev)        │
                    │  cdn.cartyx.io → R2 (prod images)    │
                    │  cdn-dev.cartyx.io → R2 (dev images) │
                    └─────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              ┌──────────┐   ┌──────────┐   ┌──────────────┐
              │  Vercel   │   │  Vercel   │   │ Cloudflare   │◄── Browser
              │   Prod    │   │   Dev     │   │     R2       │  (direct PUT
              │  (main)   │   │  (dev)    │   │  (images)    │  via presigned
              └─────┬─────┘   └─────┬─────┘   └──────────────┘     URL)
                    │               │
                    └───────┬───────┘
                            ▼
                    ┌──────────────┐
                    │ MongoDB Atlas │
                    │  (prod/dev)   │
                    └──────────────┘
```

> **Image uploads:** In production, the browser uploads images directly to R2 via a presigned PUT URL (Vercel only handles the presign request, never the image bytes). In local dev without `CDN_URL`, images fall back to a server-side base64 path saved to `public/uploads/`.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [MongoDB Atlas](#1-mongodb-atlas)
3. [OAuth Providers](#2-oauth-providers)
4. [Cloudflare Setup](#3-cloudflare-setup)
5. [Vercel Setup](#4-vercel-setup)
6. [Environment Variables Reference](#5-environment-variables-reference)
7. [Local Development](#6-local-development)
8. [CI/CD Pipeline](#7-cicd-pipeline)
9. [DNS Configuration](#8-dns-configuration)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- GitHub account with access to the repository
- Vercel account (free Hobby plan works — repo must be on a personal GitHub account, not an org)
- Cloudflare account (free plan)
- MongoDB Atlas account (free M0 cluster)
- Google Cloud Console account (for Google OAuth)
- Domain name with DNS managed by Cloudflare

---

## 1. MongoDB Atlas

You need **two clusters** — one for production, one for dev/staging.

### Create Clusters

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a new project (or use existing)
3. Click **Build a Database**
4. Select **M0 Free Tier** (Shared)
5. Choose a cloud provider and region close to your users
6. Name it (e.g., `cartyx-prod`)
7. Create a database user with a strong password
8. Repeat for a dev cluster (e.g., `cartyx-dev`)

### Network Access

Since Vercel uses dynamic IPs, you need to allow access from anywhere:

1. Go to **Security** → **Network Access**
2. Click **+ Add IP Address**
3. Click **Allow Access from Anywhere** (adds `0.0.0.0/0`)
4. Click **Confirm**

> **Note:** Your database is still protected by username/password auth. This just means any IP can *attempt* to connect — they still need valid credentials.

Do this for **both** prod and dev clusters.

### Get Connection Strings

1. Go to your cluster → **Connect** → **Drivers**
2. Copy the connection string — it looks like:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/cartyx?appName=Cluster0
   ```
3. Replace `<password>` with your actual password
4. Save both connection strings — you'll need them for Vercel env vars

---

## 2. OAuth Providers

Cartyx supports Google, GitHub, and Apple Sign-In. You need to create OAuth applications for each provider you want to support, and you need **separate apps for prod and dev** (different redirect URIs).

### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or select existing)
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth Client ID**
5. Application type: **Web application**
6. Name: `Cartyx` (or `Cartyx Dev` for the dev app)
7. **Authorized JavaScript origins:**
   - Production: `https://app.cartyx.io`
   - Dev: `https://dev.cartyx.io`
   - Local: `http://localhost:3000`
8. **Authorized redirect URIs:**
   - Production: `https://app.cartyx.io/auth/callback/google`
   - Dev: `https://dev.cartyx.io/auth/callback/google`
   - Local: `http://localhost:3000/auth/callback/google`
9. Click **Create** → copy **Client ID** and **Client Secret**

> **Tip:** Google allows multiple redirect URIs per OAuth client. You can use one client for all environments or create separate ones (separate is cleaner).

### GitHub OAuth

1. Go to GitHub → **Settings** → **Developer settings** → **OAuth Apps**
2. Click **New OAuth App**
3. Fill in:
   - **Application name:** `Cartyx` (or `Cartyx Dev`)
   - **Homepage URL:** `https://app.cartyx.io` (or `https://dev.cartyx.io`)
   - **Authorization callback URL:** `https://app.cartyx.io/auth/callback/github`
4. Click **Register application**
5. Copy the **Client ID**
6. Click **Generate a new client secret** → copy it

> **Important:** GitHub only allows **one callback URL per app**. Create separate OAuth apps for prod and dev.

### Apple Sign-In (Optional)

Apple Sign-In requires an Apple Developer account ($99/year) and is more complex to set up:

1. Go to [Apple Developer Portal](https://developer.apple.com/account)
2. **Identifiers** → Register a new **Services ID**
   - Description: `Cartyx`
   - Identifier: `io.cartyx.signin`
   - Enable **Sign In with Apple** → Configure:
     - Primary App ID: your app's bundle ID
     - Domains: `app.cartyx.io`
     - Return URLs: `https://app.cartyx.io/auth/callback/apple`
3. **Keys** → Create a new key
   - Enable **Sign In with Apple**
   - Download the `.p8` key file
   - Note the **Key ID**

For Vercel deployment, the Apple private key needs to be stored as an environment variable (base64-encoded) rather than a file path. This requires a code change to read from env var instead of filesystem — see the codebase for current implementation.

Required env vars:
- `APPLE_CLIENT_ID` — the Services ID (e.g., `io.cartyx.signin`)
- `APPLE_TEAM_ID` — your Apple Developer Team ID
- `APPLE_KEY_ID` — the key ID from the key you created
- `APPLE_PRIVATE_KEY_PATH` — path to the `.p8` file (local dev only)

---

## 3. Cloudflare Setup

Cloudflare handles DNS, CDN, and image storage (R2).

### Add Your Domain

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click **Add a Site** → enter your domain (e.g., `cartyx.io`)
3. Select the **Free** plan
4. Cloudflare will scan your existing DNS records
5. Update your domain registrar's nameservers to the ones Cloudflare provides
6. Wait for nameserver propagation (15 min – 48 hours)

### Create R2 Buckets

1. In Cloudflare Dashboard → **R2 Object Storage**
2. Click **Create bucket**
3. Name: `cartyx-production` → Create
4. Repeat: Name: `cartyx-dev` → Create

### Set Up R2 Custom Domains

For each bucket:
1. Go to the bucket → **Settings** → **Custom Domains**
2. Add domain:
   - Production bucket: `cdn.cartyx.io`
   - Dev bucket: `cdn-dev.cartyx.io`
3. Cloudflare automatically creates the DNS records (orange cloud / proxied)

### Configure R2 CORS Policy

Direct browser uploads require CORS to allow PUT requests from your app domain.

For each bucket, go to **R2 bucket → Settings → CORS Policy → Add CORS policy** and add:

**Production bucket (`cartyx-production`):**
```json
[
  {
    "AllowedOrigins": ["https://app.cartyx.io"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

**Dev bucket (`cartyx-dev`):**
```json
[
  {
    "AllowedOrigins": ["https://dev.cartyx.io", "http://localhost:3000"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

### Create R2 API Token

1. Go to **R2 Object Storage** → **Manage R2 API Tokens** (or **My Profile** → **API Tokens**)
2. Click **Create API Token**
3. Permissions: **Object Read & Write**
4. Scope: Select both `cartyx-production` and `cartyx-dev` buckets
5. Click **Create API Token**
6. **Copy immediately** (shown only once):
   - **Access Key ID**
   - **Secret Access Key**
7. Note your **Account ID** (visible on the R2 overview page or in the dashboard URL)

---

## 4. Vercel Setup

### Create the Vercel Project

1. Go to [vercel.com](https://vercel.com) → log in
2. Click **Add New...** → **Project**
3. Import the `cartyx-app` repository from GitHub
4. Leave defaults (Vite framework, `vite build` command)
5. **Don't deploy yet** — add environment variables first

### Configure Environment Variables

Go to **Settings** → **Environment Variables**.

Vercel lets you set different values per environment. Use the checkboxes:
- **Production** — only `main` branch
- **Preview** — all other branches and PRs

Add each variable from the [Environment Variables Reference](#5-environment-variables-reference) below, selecting the appropriate environment(s).

### Configure Domains

Go to **Settings** → **Domains**:

1. Add `app.cartyx.io` → assign to **Production** (default)
2. Add `dev.cartyx.io` → assign to **Git Branch** → type `dev`

### Configure Git

Go to **Settings** → **Git**:
- **Production Branch:** `main`
- Leave "Ignored Build Step" empty — Vercel should build all branches

### Create the `dev` Branch

If it doesn't exist yet:

```bash
git checkout main
git checkout -b dev
git push origin dev
```

---

## 5. Environment Variables Reference

### All Environments

| Variable | Description | Example |
|---|---|---|
| `SESSION_SECRET` | JWT signing secret (min 32 chars) | `openssl rand -hex 32` |
| `R2_ACCOUNT_ID` | Cloudflare account ID | `66cc5f108c...` |
| `R2_ACCESS_KEY_ID` | R2 API token access key | from R2 API token creation |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret | from R2 API token creation |

### Production Only

| Variable | Value |
|---|---|
| `MONGODB_URI` | `mongodb+srv://...` (prod cluster) |
| `BASE_URL` | `https://app.cartyx.io` |
| `GOOGLE_CLIENT_ID` | prod Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | prod Google OAuth client secret |
| `GITHUB_CLIENT_ID` | prod GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | prod GitHub OAuth app client secret |
| `R2_BUCKET` | `cartyx-production` |
| `CDN_URL` | `https://cdn.cartyx.io` |
| `POSTHOG_KEY` | prod PostHog project API key |

### Preview / Dev Only

| Variable | Value |
|---|---|
| `MONGODB_URI` | `mongodb+srv://...` (dev cluster) |
| `BASE_URL` | `https://dev.cartyx.io` |
| `GOOGLE_CLIENT_ID` | dev Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | dev Google OAuth client secret |
| `GITHUB_CLIENT_ID` | dev GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | dev GitHub OAuth app client secret |
| `R2_BUCKET` | `cartyx-dev` |
| `CDN_URL` | `https://cdn-dev.cartyx.io` |
| `POSTHOG_KEY` | dev PostHog project API key (or same as prod) |

### PostHog (Optional)

| Variable | Description |
|---|---|
| `VITE_PUBLIC_POSTHOG_KEY` | Client-side PostHog project key |
| `VITE_PUBLIC_POSTHOG_HOST` | PostHog host (default: `https://app.posthog.com`) |
| `POSTHOG_KEY` | Server-side PostHog project key |
| `POSTHOG_HOST` | Server-side PostHog host |

### Local Development Only

These are only needed in your local `.env` file:

| Variable | Value |
|---|---|
| `PORT` | `3001` (or any open port) |
| `NODE_ENV` | `development` |
| `APPLE_PRIVATE_KEY_PATH` | `keys/apple.p8` (if using Apple Sign-In) |

> **Note:** When `CDN_URL` is not set (local dev), image uploads fall back to the local filesystem (`public/uploads/`). No R2 credentials needed for local development.

---

## 6. Local Development

```bash
# 1. Clone and install
git clone https://github.com/biozal/cartyx-app.git
cd cartyx-app
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your dev credentials (see reference above)

# 3. Start dev server
npm run dev
# Opens at http://localhost:3000
```

### Local without OAuth

If you just want to explore the UI without setting up OAuth:
- The app will show login buttons as "not configured" for providers without env vars
- You can still view unauthenticated pages

### Local with R2 Images

Image uploads work locally without R2 — files save to `public/uploads/`. To test R2 locally, add the R2 env vars to your `.env` file and set `CDN_URL`.

---

## 7. CI/CD Pipeline

### Pull Request Checks (`ci.yml`)

Every PR automatically runs:
1. **Type check** — `npm run typecheck`
2. **Lint** — `npm run lint`
3. **Test** — `npm run test:ci` (with coverage)
4. **Build** — `npm run build`

All must pass before merging.

### Vercel Deployments

Vercel deploys are triggered automatically on every push:

| Push to | Deploys to | URL |
|---|---|---|
| Any PR branch | Preview | `*.vercel.app` (auto-generated) |
| `dev` | Preview | `dev.cartyx.io` |
| `main` | Production | `app.cartyx.io` |

### Deployment Flow

```
1. Create feature branch from dev
2. Push code → CI runs automatically
3. Vercel creates preview deployment with unique URL
4. Merge PR to dev → deploys to dev.cartyx.io
5. Test on staging
6. PR from dev → main → deploys to app.cartyx.io
```

---

## 8. DNS Configuration

All DNS is managed in Cloudflare. Required records:

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `app` | `cname.vercel-dns.com` | **OFF** (DNS only / grey cloud) |
| CNAME | `dev` | `cname.vercel-dns.com` | **OFF** (DNS only / grey cloud) |
| CNAME | `cdn` | *(auto-created by R2 custom domain)* | **ON** (proxied / orange cloud) |
| CNAME | `cdn-dev` | *(auto-created by R2 custom domain)* | **ON** (proxied / orange cloud) |

> **Important:** Vercel domains must have Cloudflare proxy **OFF** (grey cloud). Vercel manages its own SSL and will fail with Cloudflare's proxy enabled. R2 custom domains need the proxy **ON**.

---

## Troubleshooting

### OAuth Redirect Errors

- **"redirect_uri_mismatch"** — The callback URL in your OAuth app doesn't match `BASE_URL` + `/auth/callback/<provider>`. Check that `BASE_URL` matches exactly (including `https://`).
- **GitHub only allows one callback URL** — Make sure it matches the environment you're testing.

### MongoDB Connection Failures

- **"MongoServerError: bad auth"** — Wrong username/password in `MONGODB_URI`.
- **Connection timeout** — Check that `0.0.0.0/0` is in your Atlas Network Access list.
- **"ENOTFOUND"** — The cluster hostname is wrong. Re-copy the connection string from Atlas.

### Image Upload Failures

- **"Access Denied" from R2** — Check `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and that the API token has write access to the target bucket.
- **Images don't display** — Check `CDN_URL` matches the R2 custom domain. Verify the custom domain is active in Cloudflare R2 settings.
- **CORS error on image upload** — Check the R2 bucket CORS policy includes your app's domain. See [Configure R2 CORS Policy](#configure-r2-cors-policy) above.
- **"Direct uploads require CDN_URL configuration"** — Set the `CDN_URL` environment variable to your R2 custom domain. For local dev without `CDN_URL`, images fall back to the local filesystem upload path automatically.

### Vercel Build Failures

- **"npm ci can only install packages when package.json and package-lock.json are in sync"** — Regenerate the lockfile: `rm package-lock.json && npm install`, then commit.
- **Build timeout** — Free tier has a 45-minute build limit. Cartyx builds in under 2 minutes.

### DNS Not Working

- **Nameserver propagation** — Can take up to 48 hours after changing nameservers. Check with `dig app.cartyx.io` or [dnschecker.org](https://dnschecker.org).
- **SSL errors on Vercel domains** — Make sure Cloudflare proxy is OFF (grey cloud) for `app` and `dev` CNAME records.
