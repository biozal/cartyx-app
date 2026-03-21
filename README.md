# Cartyx ⚔️

D&D Campaign Management Platform — organize sessions, manage players, and run your tabletop world.

## Quick Start

```bash
npm install
cp .env.example .env
# Fill in your OAuth credentials and MongoDB URI
npm start
```

## Features

- **OAuth Authentication** — Google, GitHub, Apple Sign-In
- **Campaign Management** — Create, edit, and manage D&D campaigns
- **Player Invites** — Share invite codes for players to join
- **Session Scheduling** — Weekly/bi-weekly/monthly with timezone support

## Tech Stack

- **Runtime:** Node.js + Express
- **Auth:** Passport.js (Google, GitHub, Apple)
- **Database:** MongoDB Atlas (Mongoose)
- **Hosting:** Nginx reverse proxy on Linux

## Project Structure

```
├── server.js           # Main application (Express routes + views)
├── public/             # Static assets (logos, CSS)
├── scripts/            # Utility scripts (seed, migrations, runner setup)
├── .github/workflows/  # CI/CD pipeline
├── .env.example        # Environment variable template
└── package.json
```

## Deployment

Deployments are automated via GitHub Actions. When code is merged to `main`, a self-hosted runner on the production server:

1. Checks out the latest code
2. Installs dependencies
3. Syncs files to the deploy directory (`/var/www/cartyx-app`)
4. Restarts the application via PM2
5. Runs a health check

The deploy workflow **does not** copy `.env` or `keys/` — those live in a secure location on the server and are symlinked into the deploy directory automatically.

### First-Time Server Setup

```bash
# 1. Get a runner registration token from:
#    https://github.com/Cartyx/cartyx-app/settings/actions/runners/new

# 2. Run the setup script on your server (as a regular user, NOT root):
#    You'll be prompted for the token securely (no shell history leak).
./scripts/setup-runner.sh

# 3. Pre-provision the deploy directory (owned by the runner user):
sudo mkdir -p /var/www/cartyx-app
sudo chown "$(id -un):$(id -gn)" /var/www/cartyx-app

# 4. Create the secure config directory on the server:
sudo mkdir -p /var/www/cartyx-auth/keys
sudo chown -R "$(id -un):$(id -gn)" /var/www/cartyx-auth

# 5. Create your .env file in the secure config directory:
cp .env.example /var/www/cartyx-auth/.env
# Edit /var/www/cartyx-auth/.env with your OAuth credentials, MongoDB URI, etc.
# IMPORTANT: Ensure NODE_ENV=production is set — this enables secure session cookies.

# 6. Place your Apple Sign-In key in the secure keys directory:
cp /path/to/your/apple.p8 /var/www/cartyx-auth/keys/apple.p8

# 7. Update nginx to serve from /var/www/cartyx-app/public.
#    The deploy workflow verifies nginx config but does NOT modify it.
#    You must update nginx manually on first setup:
#    - Replace /var/www/cartyx-auth/public with /var/www/cartyx-app/public in your nginx config
#    - sudo nginx -t && sudo systemctl reload nginx
```

## Environment Variables

See `.env.example` for required configuration.

## License

MIT — see [LICENSE](LICENSE)
