'use strict';

const session = require('express-session');
const config = require('../config');

function sessionMiddleware() {
  return session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: config.sessionDurationDefault,
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
    },
  });
}

function isAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Not authenticated', user: null });
  }
  return res.redirect('/?reason=session_expired');
}

function applyRememberMe(req) {
  if (req.session.rememberMe) {
    req.session.cookie.maxAge = config.sessionDurationRemember;
    req.session.sessionExpiresAt = Date.now() + config.sessionDurationRemember;
    delete req.session.rememberMe;
  } else {
    req.session.cookie.maxAge = config.sessionDurationDefault;
    req.session.sessionExpiresAt = Date.now() + config.sessionDurationDefault;
  }
}

module.exports = { sessionMiddleware, isAuthenticated, applyRememberMe };
