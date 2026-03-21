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

module.exports = app;
