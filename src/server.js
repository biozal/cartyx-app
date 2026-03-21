'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const app = require('./app');
const config = require('./config');

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
  console.log('');
});
