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
3. Syncs files to the deploy directory
4. Restarts the application via PM2
5. Runs a health check

### First-Time Server Setup

```bash
# 1. Get a runner registration token from:
#    https://github.com/Cartyx/cartyx-app/settings/actions/runners/new

# 2. Run the setup script on your server:
./scripts/setup-runner.sh <REGISTRATION_TOKEN>

# 3. Create your .env file:
cp .env.example .env
# Fill in OAuth credentials, MongoDB URI, etc.

# 4. Place your Apple Sign-In key at keys/apple.p8
```

## Environment Variables

See `.env.example` for required configuration.

## License

MIT — see [LICENSE](LICENSE)
