'use strict';

const { PostHog } = require('posthog-node');
const config = require('./index');

let posthogClient = null;

if (config.posthog.apiKey) {
  posthogClient = new PostHog(config.posthog.apiKey, {
    host: config.posthog.host,
    // Flush settings — batch up to 20 events, flush every 10s
    flushAt: 20,
    flushInterval: 10000,
  });
  console.log('✅ PostHog server-side client initialized');
} else {
  console.log('⚠️  PostHog not configured (missing VITE_PUBLIC_POSTHOG_KEY)');
}

/**
 * Graceful shutdown — flush pending events before exit.
 */
async function shutdownPosthog() {
  if (posthogClient) {
    await posthogClient.shutdown();
  }
}

module.exports = { posthogClient, shutdownPosthog };
