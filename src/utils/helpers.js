'use strict';

const fs = require('fs');
const mongoose = require('mongoose');

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function providerConfigured(provider) {
  switch (provider) {
    case 'google':
      return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    case 'github':
      return !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
    case 'apple': {
      if (!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID)) return false;
      const keyPath = process.env.APPLE_PRIVATE_KEY_PATH;
      if (!keyPath) return false;
      try { fs.accessSync(keyPath, fs.constants.R_OK); return true; } catch { return false; }
    }
    default:
      return false;
  }
}

function normalizeProfile(provider, profile, accessToken, refreshToken) {
  let email = null;
  if (profile.emails && profile.emails.length) {
    email = profile.emails[0].value;
  } else if (profile.email) {
    email = profile.email;
  }

  let avatar = null;
  if (profile.photos && profile.photos.length) {
    avatar = profile.photos[0].value;
  } else if (profile._json && profile._json.avatar_url) {
    avatar = profile._json.avatar_url;
  }

  return {
    id: `${provider}_${profile.id}`,
    provider,
    name: profile.displayName || profile.name || email || 'Unknown',
    email,
    avatar,
    accessToken: accessToken || null,
    refreshToken: refreshToken || null,
    tokenIssuedAt: Date.now(),
  };
}

function generateInviteCode() {
  const crypto = require('crypto');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = () =>
    Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join('');
  return `${part()}-${part()}`;
}

async function upsertUser(profile) {
  if (!mongoose.connection.readyState) return profile;
  const User = require('../models/User');
  try {
    const nameParts = (profile.name || '').split(' ');
    const stored = await User.findOneAndUpdate(
      { providerId: profile.id },
      {
        provider:   profile.provider,
        providerId: profile.id,
        ...(profile.email  && { email:     profile.email }),
        ...(profile.name   && { firstName: nameParts[0] || '', lastName: nameParts.slice(1).join(' ') || '' }),
        ...(profile.avatar && { avatarUrl: profile.avatar }),
        lastLoginAt: new Date(),
        $setOnInsert: { createdAt: new Date(), role: 'unknown' },
      },
      { upsert: true, returnDocument: 'after', new: true }
    );
    return {
      ...profile,
      email:  profile.email  || stored?.email  || null,
      name:   profile.name   || `${stored?.firstName || ''} ${stored?.lastName || ''}`.trim() || null,
      avatar: profile.avatar || stored?.avatarUrl || null,
      role:   stored?.role   || 'unknown',
    };
  } catch (err) {
    console.error('❌ upsertUser error:', err.message);
    return profile;
  }
}

module.exports = { escapeHtml, providerConfigured, normalizeProfile, generateInviteCode, upsertUser };
