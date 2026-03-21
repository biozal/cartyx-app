'use strict';

const passport = require('passport');
const config = require('./index');
const { providerConfigured, normalizeProfile, upsertUser } = require('../utils/helpers');

function setupPassport() {
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((obj, done) => done(null, obj));

  // ── Google ──
  if (providerConfigured('google')) {
    const GoogleStrategy = require('passport-google-oauth20').Strategy;
    passport.use(
      new GoogleStrategy(
        {
          clientID: config.oauth.google.clientId,
          clientSecret: config.oauth.google.clientSecret,
          callbackURL: `${config.baseUrl}/auth/google/callback`,
          scope: ['profile', 'email'],
          accessType: 'offline',
          prompt: 'consent',
        },
        (accessToken, refreshToken, profile, done) => {
          upsertUser(normalizeProfile('google', profile, accessToken, refreshToken))
            .then(u => done(null, u))
            .catch(() => done(null, normalizeProfile('google', profile, accessToken, refreshToken)));
        }
      )
    );
    console.log('✅ Google OAuth strategy loaded');
  } else {
    console.log('⚠️  Google OAuth not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)');
  }

  // ── GitHub ──
  if (providerConfigured('github')) {
    const GitHubStrategy = require('passport-github2').Strategy;
    passport.use(
      new GitHubStrategy(
        {
          clientID: config.oauth.github.clientId,
          clientSecret: config.oauth.github.clientSecret,
          callbackURL: `${config.baseUrl}/auth/github/callback`,
          scope: ['user:email'],
        },
        (accessToken, refreshToken, profile, done) => {
          upsertUser(normalizeProfile('github', profile, accessToken, null))
            .then(u => done(null, u))
            .catch(() => done(null, normalizeProfile('github', profile, accessToken, null)));
        }
      )
    );
    console.log('✅ GitHub OAuth strategy loaded');
  } else {
    console.log('⚠️  GitHub OAuth not configured (missing GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET)');
  }

  // ── Apple ──
  if (providerConfigured('apple')) {
    const AppleStrategy = require('passport-apple').Strategy;
    passport.use(
      new AppleStrategy(
        {
          clientID: config.oauth.apple.clientId,
          teamID: config.oauth.apple.teamId,
          keyID: config.oauth.apple.keyId,
          privateKeyString: require('fs').readFileSync(config.oauth.apple.privateKeyPath, 'utf8'),
          callbackURL: `${config.baseUrl}/auth/apple/callback`,
          scope: ['name', 'email'],
        },
        (accessToken, refreshToken, idToken, profile, done) => {
          const user = {
            id: `apple_${profile.id || idToken.sub}`,
            provider: 'apple',
            name: profile.name
              ? `${profile.name.firstName || ''} ${profile.name.lastName || ''}`.trim()
              : 'Apple User',
            email: profile.email || idToken.email || null,
            avatar: null,
            accessToken: accessToken || null,
            refreshToken: refreshToken || null,
            tokenIssuedAt: Date.now(),
          };
          upsertUser(user).then(u => done(null, u)).catch(() => done(null, user));
        }
      )
    );
    console.log('✅ Apple OAuth strategy loaded');
  } else {
    console.log('⚠️  Apple OAuth not configured (missing credentials or private key)');
  }

  return passport;
}

module.exports = { setupPassport };
