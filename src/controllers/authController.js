'use strict';

const passport = require('passport');
const { providerConfigured } = require('../utils/helpers');
const { applyRememberMe } = require('../middleware/auth');

// ── Token revocation ──

async function revokeToken(user) {
  if (!user || !user.accessToken) return;

  switch (user.provider) {
    case 'google': {
      const resp = await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(user.accessToken)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      if (!resp.ok) console.warn('Google token revocation returned:', resp.status);
      else console.log('🔒 Google token revoked');
      break;
    }
    case 'apple': {
      console.log('🔒 Apple token revocation would POST to https://appleid.apple.com/auth/revoke');
      break;
    }
    case 'github': {
      if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) break;
      const credentials = Buffer.from(
        `${process.env.GITHUB_CLIENT_ID}:${process.env.GITHUB_CLIENT_SECRET}`
      ).toString('base64');
      const resp = await fetch(
        `https://api.github.com/applications/${process.env.GITHUB_CLIENT_ID}/token`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Basic ${credentials}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ access_token: user.accessToken }),
        }
      );
      if (resp.status === 204) console.log('🔒 GitHub token revoked');
      else console.warn('GitHub token revocation returned:', resp.status);
      break;
    }
  }
}

// ── Route handlers ──

function notConfiguredPage(provider) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Not Configured</title>
  <style>
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
           background:#0d0d0d; color:#c9b89e; font-family:'Segoe UI',sans-serif; }
    .card { background:#1a1a1a; border:1px solid #3a2f24; border-radius:12px; padding:2.5rem;
            max-width:480px; text-align:center; }
    h2 { color:#e8d5b7; margin-bottom:.5rem; }
    p { line-height:1.6; }
    a { color:#d4a853; text-decoration:none; }
    a:hover { text-decoration:underline; }
    code { background:#2a2218; padding:2px 6px; border-radius:4px; font-size:.9em; }
  </style>
</head>
<body>
  <div class="card">
    <h2>⚠️ ${provider} Sign-In Not Configured</h2>
    <p>This authentication method isn't set up yet.<br>
    Add the required credentials to your <code>.env</code> file and restart the server.</p>
    <p><a href="/">← Back to Sign In</a></p>
  </div>
</body>
</html>`;
}

exports.googleAuth = (req, res, next) => {
  if (!providerConfigured('google')) return res.status(501).send(notConfiguredPage('Google'));
  if (req.query.remember === 'true') req.session.rememberMe = true;
  passport.authenticate('google', { accessType: 'offline', prompt: 'consent' })(req, res, next);
};

exports.googleCallback = [
  (req, res, next) => {
    if (!providerConfigured('google')) return res.redirect('/');
    passport.authenticate('google', { failureRedirect: '/?reason=auth_failed' })(req, res, next);
  },
  (req, res) => {
    applyRememberMe(req);
    res.redirect('/campaigns');
  },
];

exports.githubAuth = (req, res, next) => {
  if (!providerConfigured('github')) return res.status(501).send(notConfiguredPage('GitHub'));
  if (req.query.remember === 'true') req.session.rememberMe = true;
  passport.authenticate('github', { scope: ['user:email'] })(req, res, next);
};

exports.githubCallback = [
  (req, res, next) => {
    if (!providerConfigured('github')) return res.redirect('/');
    passport.authenticate('github', { failureRedirect: '/?reason=auth_failed' })(req, res, next);
  },
  (req, res) => {
    applyRememberMe(req);
    res.redirect('/campaigns');
  },
];

exports.appleAuth = (req, res, next) => {
  if (!providerConfigured('apple')) return res.status(501).send(notConfiguredPage('Apple'));
  if (req.query.remember === 'true') req.session.rememberMe = true;
  passport.authenticate('apple')(req, res, next);
};

exports.appleCallbackPost = (req, res, next) => {
  if (!providerConfigured('apple')) return res.redirect('/');
  passport.authenticate('apple', { failureRedirect: '/?reason=auth_failed' }, (err, user, info) => {
    if (err) {
      console.error('🍎 Apple auth error:', JSON.stringify(err, null, 2));
      console.error('🍎 Apple auth info:', JSON.stringify(info, null, 2));
      return res.redirect('/?reason=auth_failed');
    }
    if (!user) {
      console.error('🍎 Apple no user, info:', JSON.stringify(info, null, 2));
      return res.redirect('/?reason=auth_failed');
    }
    req.logIn(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      applyRememberMe(req);
      res.redirect('/campaigns');
    });
  })(req, res, next);
};

exports.appleCallbackGet = [
  (req, res, next) => {
    if (!providerConfigured('apple')) return res.redirect('/');
    passport.authenticate('apple', { failureRedirect: '/?reason=auth_failed' })(req, res, next);
  },
  (req, res) => {
    applyRememberMe(req);
    res.redirect('/campaigns');
  },
];

exports.logout = async (req, res) => {
  const user = req.user;
  if (user) {
    try {
      await revokeToken(user);
    } catch (err) {
      console.error('Token revocation error (non-fatal):', err.message);
    }
  }
  req.logout((err) => {
    if (err) console.error('Logout error:', err);
    req.session.destroy((destroyErr) => {
      if (destroyErr) console.error('Session destroy error:', destroyErr);
      res.clearCookie('connect.sid');
      res.redirect('/');
    });
  });
};

exports.tokenRefresh = async (req, res) => {
  const user = req.user;

  if (user.provider === 'google' && user.refreshToken) {
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: user.refreshToken,
          grant_type: 'refresh_token',
        }),
      });
      const data = await response.json();
      if (data.access_token) {
        user.accessToken = data.access_token;
        user.tokenIssuedAt = Date.now();
        req.login(user, (err) => {
          if (err) return res.status(500).json({ error: 'Failed to update session' });
          return res.json({ success: true, message: 'Google token refreshed', tokenIssuedAt: user.tokenIssuedAt });
        });
      } else {
        return res.status(400).json({ success: false, error: 'Refresh failed', details: data });
      }
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  } else if (user.provider === 'apple' && user.refreshToken) {
    return res.json({
      success: false,
      message: 'Apple token refresh requires generating a client_secret JWT. See README for details.',
      endpoint: 'https://appleid.apple.com/auth/token',
    });
  } else if (user.provider === 'github') {
    return res.json({
      success: false,
      message: 'GitHub OAuth does not support refresh tokens. Re-authenticate to get a new token.',
    });
  } else {
    return res.status(400).json({ success: false, message: 'No refresh token available for this provider.' });
  }
};
