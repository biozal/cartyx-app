'use strict';

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

let sessionSecret = process.env.SESSION_SECRET;
if (NODE_ENV === 'production' && !sessionSecret) {
  throw new Error('SESSION_SECRET environment variable must be set in production');
}
sessionSecret = sessionSecret || 'unsafe-default-secret';

module.exports = {
  port: PORT,
  baseUrl: process.env.BASE_URL || `http://localhost:${PORT}`,
  sessionSecret,
  nodeEnv: NODE_ENV,
  mongodbUri: process.env.MONGODB_URI,
  sessionDurationDefault: 24 * 60 * 60 * 1000,
  sessionDurationRemember: 30 * 24 * 60 * 60 * 1000,
  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
    apple: {
      clientId: process.env.APPLE_CLIENT_ID,
      teamId: process.env.APPLE_TEAM_ID,
      keyId: process.env.APPLE_KEY_ID,
      privateKeyPath: process.env.APPLE_PRIVATE_KEY_PATH,
    },
  },
  posthog: {
    apiKey: process.env.VITE_PUBLIC_POSTHOG_KEY,
    host: process.env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
  },
};
