'use strict';

const express = require('express');
const path = require('path');
const passport = require('passport');

const { sessionMiddleware } = require('./middleware/auth');
const { setupPassport } = require('./config/passport');

// Routes
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const campaignRoutes = require('./routes/campaigns');
const apiRoutes = require('./routes/api');

const app = express();

// ── View engine ──
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Body parsing ──
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── Reverse proxy trust (nginx terminates TLS) ──
const config = require('./config');
if (config.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

// ── Session & Passport ──
app.use(sessionMiddleware());
app.use(passport.initialize());
app.use(passport.session());
setupPassport();

// ── Static files ──
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Routes ──
app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/campaigns', campaignRoutes);
app.use('/api', apiRoutes);

app.get('/logout', require('./controllers/authController').logout);

// ── Error handler (must be last — catches multer, route errors, etc.) ──
const { escapeHtml } = require('./utils/helpers');
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.message);
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
  const statusCode = err.status || 500;
  const safeMessage = config.nodeEnv === 'production' ? 'Something went wrong.' : escapeHtml(err.message);
  res.status(statusCode).send(`<h1>${statusCode}</h1><p>${safeMessage}</p>`);
});

module.exports = app;
