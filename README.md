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
├── scripts/            # Utility scripts (seed, migrations)
├── poc/                # Proof-of-concept experiments
├── .env.example        # Environment variable template
└── package.json
```

## Environment Variables

See `.env.example` for required configuration.

## License

MIT — see [LICENSE](LICENSE)
