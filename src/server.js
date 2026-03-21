'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const app = require('./app');
const config = require('./config');
const { shutdownPosthog } = require('./config/posthog');

// ── Connect to MongoDB ──
if (config.mongodbUri) {
  mongoose.connect(config.mongodbUri)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.error('❌ MongoDB error:', err.message));
} else {
  console.warn('⚠️  MONGODB_URI not set — users will not be persisted');
}

// ── Start server ──
app.listen(config.port, () => {
  console.log(`\n🏰 Cartyx running at ${config.baseUrl}\n`);
  console.log('Configured providers:');
  const { providerConfigured } = require('./utils/helpers');
  console.log(`  Google: ${providerConfigured('google') ? '✅' : '❌ (add credentials to .env)'}`);
  console.log(`  GitHub: ${providerConfigured('github') ? '✅' : '❌ (add credentials to .env)'}`);
  console.log(`  Apple:  ${providerConfigured('apple')  ? '✅' : '❌ (add credentials to .env)'}`);
  console.log(`  PostHog: ${config.posthog.apiKey ? '✅' : '❌ (add VITE_PUBLIC_POSTHOG_KEY to .env)'}`);
  console.log('');
});

// ── Graceful shutdown ──
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received — shutting down gracefully...`);
  await shutdownPosthog();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
