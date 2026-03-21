require("dotenv").config();

const express = require("express");
const session = require("express-session");
const passport = require("passport");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const multer = require("multer");

const campaignImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "public", "uploads", "campaigns");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const uploadCampaignImage = multer({
  storage: campaignImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files allowed"));
  },
});

// ── MongoDB User Model ──
const userSchema = new mongoose.Schema({
  email:      { type: String, unique: true, sparse: true },
  role:       { type: String, enum: ['gm', 'player', 'unknown'], default: 'unknown', index: true },
  provider:   String,
  providerId: { type: String, unique: true, sparse: true },
  firstName:  String,
  lastName:   String,
  avatarUrl:  String,
  campaigns:  [{ campaignId: mongoose.Schema.Types.ObjectId, joinedAt: Date, status: String }],
  lastLoginAt:{ type: Date, default: Date.now },
  createdAt:  { type: Date, default: Date.now },
});
const User = mongoose.models.User || mongoose.model("User", userSchema);

// ── MongoDB Campaign Model ──
const campaignSchema = new mongoose.Schema({
  gameMasterId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: { type: String, required: true },
  description: String,
  imagePath: String,
  schedule: { frequency: String, dayOfWeek: String, time: String, timezone: String },
  callUrl: String,
  dndBeyondUrl: String,
  maxPlayers: { type: Number, default: 4 },
  inviteCode: { type: String, unique: true, sparse: true },
  status: { type: String, default: "active" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const Campaign = mongoose.models.Campaign || mongoose.model("Campaign", campaignSchema);

// ── Connect to MongoDB ──
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch(err => console.error("❌ MongoDB error:", err.message));
} else {
  console.warn("⚠️  MONGODB_URI not set — users will not be persisted");
}

const app = express();
const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const SESSION_DURATION_DEFAULT = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_DURATION_REMEMBER = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function providerConfigured(provider) {
  switch (provider) {
    case "google":
      return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    case "github":
      return !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
    case "apple": {
      if (!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID)) return false;
      const keyPath = process.env.APPLE_PRIVATE_KEY_PATH;
      if (!keyPath) return false;
      try { fs.accessSync(keyPath, fs.constants.R_OK); return true; } catch { return false; }
    }
    default:
      return false;
  }
}

/** Normalize user profile across providers */
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
    name: profile.displayName || profile.name || email || "Unknown",
    email,
    avatar,
    accessToken: accessToken || null,
    refreshToken: refreshToken || null,
    tokenIssuedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "unsafe-default-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: SESSION_DURATION_DEFAULT,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// ── Persist user to MongoDB ──
async function upsertUser(profile) {
  if (!mongoose.connection.readyState) return profile;
  try {
    const nameParts = (profile.name || '').split(' ');
    await User.findOneAndUpdate(
      { providerId: profile.id },
      {
        provider:   profile.provider,
        providerId: profile.id,
        ...(profile.email  && { email:     profile.email }),
        ...(profile.name   && { firstName: nameParts[0] || '', lastName: nameParts.slice(1).join(' ') || '' }),
        ...(profile.avatar && { avatarUrl: profile.avatar }),
        lastLoginAt: new Date(),
        $setOnInsert: { createdAt: new Date(), role: 'unknown' }
      },
      { upsert: true, returnDocument: 'after' }
    );
    // Fetch stored doc (picks up role + stored email for Apple)
    const stored = await User.findOne({ providerId: profile.id });
    return {
      ...profile,
      email:  profile.email  || stored?.email  || null,
      name:   profile.name   || `${stored?.firstName || ''} ${stored?.lastName || ''}`.trim() || null,
      avatar: profile.avatar || stored?.avatarUrl || null,
      role:   stored?.role   || 'unknown',
    };
  } catch(err) {
    console.error("❌ upsertUser error:", err.message);
    return profile;
  }
}

// ---------------------------------------------------------------------------
// Passport Strategies
// ---------------------------------------------------------------------------

// --- Google ---
if (providerConfigured("google")) {
  const GoogleStrategy = require("passport-google-oauth20").Strategy;
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${BASE_URL}/auth/google/callback`,
        scope: ["profile", "email"],
        accessType: "offline",
        prompt: "consent",
      },
      (accessToken, refreshToken, profile, done) => {
        upsertUser(normalizeProfile("google", profile, accessToken, refreshToken)).then(u => done(null, u)).catch(() => done(null, normalizeProfile("google", profile, accessToken, refreshToken)));
      }
    )
  );
  console.log("✅ Google OAuth strategy loaded");
} else {
  console.log("⚠️  Google OAuth not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)");
}

// --- GitHub ---
if (providerConfigured("github")) {
  const GitHubStrategy = require("passport-github2").Strategy;
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: `${BASE_URL}/auth/github/callback`,
        scope: ["user:email"],
      },
      (accessToken, refreshToken, profile, done) => {
        // GitHub doesn't provide refresh tokens
        upsertUser(normalizeProfile("github", profile, accessToken, null)).then(u => done(null, u)).catch(() => done(null, normalizeProfile("github", profile, accessToken, null)));
      }
    )
  );
  console.log("✅ GitHub OAuth strategy loaded");
} else {
  console.log("⚠️  GitHub OAuth not configured (missing GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET)");
}

// --- Apple ---
if (providerConfigured("apple")) {
  const AppleStrategy = require("passport-apple").Strategy;
  passport.use(
    new AppleStrategy(
      {
        clientID: process.env.APPLE_CLIENT_ID,
        teamID: process.env.APPLE_TEAM_ID,
        keyID: process.env.APPLE_KEY_ID,
        privateKeyString: require("fs").readFileSync(process.env.APPLE_PRIVATE_KEY_PATH, "utf8"),
        callbackURL: `${BASE_URL}/auth/apple/callback`,
        scope: ["name", "email"],
      },
      (req, accessToken, refreshToken, idToken, profile, done) => {
        // Apple sends user info only on first auth; profile may be sparse
        const user = {
          id: `apple_${profile.id || idToken.sub}`,
          provider: "apple",
          name: profile.name
            ? `${profile.name.firstName || ""} ${profile.name.lastName || ""}`.trim()
            : "Apple User",
          email: profile.email || idToken.email || null,
          avatar: null, // Apple doesn't provide avatars
          accessToken: accessToken || null,
          refreshToken: refreshToken || null,
          tokenIssuedAt: Date.now(),
        };
        upsertUser(user).then(u => done(null, u)).catch(() => done(null, user));
      }
    )
  );
  console.log("✅ Apple OAuth strategy loaded");
} else {
  console.log("⚠️  Apple OAuth not configured (missing credentials or private key)");
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

function isAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    // Check if session cookie is still valid (express-session handles expiry,
    // but let's be explicit about user object presence)
    return next();
  }
  // For API routes, return 401 JSON
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Not authenticated", user: null });
  }
  // For page routes, redirect with reason
  return res.redirect("/?reason=session_expired");
}

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

// ---------------------------------------------------------------------------
// Auth Routes — Google
// ---------------------------------------------------------------------------

app.get("/auth/google", (req, res, next) => {
  if (!providerConfigured("google")) return res.status(501).send(notConfiguredPage("Google"));
  // Store remember-me preference before redirect
  if (req.query.remember === "true") req.session.rememberMe = true;
  passport.authenticate("google", { accessType: "offline", prompt: "consent" })(req, res, next);
});

app.get(
  "/auth/google/callback",
  (req, res, next) => {
    if (!providerConfigured("google")) return res.redirect("/");
    passport.authenticate("google", { failureRedirect: "/?reason=auth_failed" })(req, res, next);
  },
  (req, res) => {
    applyRememberMe(req);
    res.redirect("/campaigns");
  }
);

// ---------------------------------------------------------------------------
// Auth Routes — GitHub
// ---------------------------------------------------------------------------

app.get("/auth/github", (req, res, next) => {
  if (!providerConfigured("github")) return res.status(501).send(notConfiguredPage("GitHub"));
  if (req.query.remember === "true") req.session.rememberMe = true;
  passport.authenticate("github", { scope: ["user:email"] })(req, res, next);
});

app.get(
  "/auth/github/callback",
  (req, res, next) => {
    if (!providerConfigured("github")) return res.redirect("/");
    passport.authenticate("github", { failureRedirect: "/?reason=auth_failed" })(req, res, next);
  },
  (req, res) => {
    applyRememberMe(req);
    res.redirect("/campaigns");
  }
);

// ---------------------------------------------------------------------------
// Auth Routes — Apple
// ---------------------------------------------------------------------------

app.get("/auth/apple", (req, res, next) => {
  if (!providerConfigured("apple")) return res.status(501).send(notConfiguredPage("Apple"));
  if (req.query.remember === "true") req.session.rememberMe = true;
  passport.authenticate("apple")(req, res, next);
});

// Apple sends a POST callback
app.post(
  "/auth/apple/callback",
  (req, res, next) => {
    if (!providerConfigured("apple")) return res.redirect("/");
    passport.authenticate("apple", { failureRedirect: "/?reason=auth_failed" }, (err, user, info) => {
      if (err) {
        console.error("🍎 Apple auth error:", JSON.stringify(err, null, 2));
        console.error("🍎 Apple auth info:", JSON.stringify(info, null, 2));
        return res.redirect("/?reason=auth_failed");
      }
      if (!user) {
        console.error("🍎 Apple no user, info:", JSON.stringify(info, null, 2));
        return res.redirect("/?reason=auth_failed");
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        applyRememberMe(req);
        res.redirect("/campaigns");
      });
    })(req, res, next);
  },
  (req, res) => {
    applyRememberMe(req);
    res.redirect("/campaigns");
  }
);

// Also handle GET callback for flexibility
app.get(
  "/auth/apple/callback",
  (req, res, next) => {
    if (!providerConfigured("apple")) return res.redirect("/");
    passport.authenticate("apple", { failureRedirect: "/?reason=auth_failed" })(req, res, next);
  },
  (req, res) => {
    applyRememberMe(req);
    res.redirect("/campaigns");
  }
);

// ---------------------------------------------------------------------------
// Remember Me
// ---------------------------------------------------------------------------

function applyRememberMe(req) {
  if (req.session.rememberMe) {
    req.session.cookie.maxAge = SESSION_DURATION_REMEMBER;
    req.session.sessionExpiresAt = Date.now() + SESSION_DURATION_REMEMBER;
    delete req.session.rememberMe;
  } else {
    req.session.cookie.maxAge = SESSION_DURATION_DEFAULT;
    req.session.sessionExpiresAt = Date.now() + SESSION_DURATION_DEFAULT;
  }
}

// ---------------------------------------------------------------------------
// Token Refresh
// ---------------------------------------------------------------------------

app.get("/auth/refresh", isAuthenticated, async (req, res) => {
  const user = req.user;

  if (user.provider === "google" && user.refreshToken) {
    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: user.refreshToken,
          grant_type: "refresh_token",
        }),
      });
      const data = await response.json();
      if (data.access_token) {
        user.accessToken = data.access_token;
        user.tokenIssuedAt = Date.now();
        req.login(user, (err) => {
          if (err) return res.status(500).json({ error: "Failed to update session" });
          return res.json({ success: true, message: "Google token refreshed", tokenIssuedAt: user.tokenIssuedAt });
        });
      } else {
        return res.status(400).json({ success: false, error: "Refresh failed", details: data });
      }
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  } else if (user.provider === "apple" && user.refreshToken) {
    try {
      // Apple token refresh requires client_secret (JWT) — complex for POC
      // Documenting the endpoint; full implementation needs the JWT generation
      return res.json({
        success: false,
        message: "Apple token refresh requires generating a client_secret JWT. See README for details.",
        endpoint: "https://appleid.apple.com/auth/token",
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  } else if (user.provider === "github") {
    return res.json({
      success: false,
      message: "GitHub OAuth does not support refresh tokens. Re-authenticate to get a new token.",
    });
  } else {
    return res.status(400).json({ success: false, message: "No refresh token available for this provider." });
  }
});

// ---------------------------------------------------------------------------
// Logout with Token Revocation
// ---------------------------------------------------------------------------

app.get("/logout", async (req, res) => {
  const user = req.user;

  if (user) {
    try {
      await revokeToken(user);
    } catch (err) {
      console.error("Token revocation error (non-fatal):", err.message);
    }
  }

  req.logout((err) => {
    if (err) console.error("Logout error:", err);
    req.session.destroy((err) => {
      if (err) console.error("Session destroy error:", err);
      res.clearCookie("connect.sid");
      res.redirect("/");
    });
  });
});

async function revokeToken(user) {
  if (!user || !user.accessToken) return;

  switch (user.provider) {
    case "google": {
      const resp = await fetch(
        `https://oauth2.googleapis.com/revoke?token=${user.accessToken}`,
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );
      if (!resp.ok) console.warn("Google token revocation returned:", resp.status);
      else console.log("🔒 Google token revoked");
      break;
    }
    case "apple": {
      // Apple revocation requires client_secret JWT — log intent for POC
      console.log("🔒 Apple token revocation would POST to https://appleid.apple.com/auth/revoke");
      break;
    }
    case "github": {
      if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) break;
      const credentials = Buffer.from(
        `${process.env.GITHUB_CLIENT_ID}:${process.env.GITHUB_CLIENT_SECRET}`
      ).toString("base64");
      const resp = await fetch(
        `https://api.github.com/applications/${process.env.GITHUB_CLIENT_ID}/token`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Basic ${credentials}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ access_token: user.accessToken }),
        }
      );
      if (resp.status === 204) console.log("🔒 GitHub token revoked");
      else console.warn("GitHub token revocation returned:", resp.status);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Protected Routes
// ---------------------------------------------------------------------------

// Mock campaigns removed — will be replaced with real DB queries

function renderCampaignCard(campaign, isGm) {
  const statusColor = campaign.status === "active" ? "#FFFFFF" : "#CBD5E1";
  const statusBg = campaign.status === "active" ? "#2563EB" : "#334155";
  const statusLabel = campaign.status === "active" ? "ACTIVE" : "PAUSED";
  const playerPct = Math.round((campaign.players.current / campaign.players.max) * 100);
  const bannerFallback = campaign.status === "active"
    ? "linear-gradient(135deg, #0F1729 0%, #0D1B3E 50%, #0A1628 100%)"
    : "linear-gradient(135deg, #0F1117 0%, #141820 50%, #0C0E14 100%)";
  const bannerStyle = campaign.imagePath
    ? `background:url('${campaign.imagePath}') center/cover no-repeat, ${bannerFallback};`
    : `background:${bannerFallback};`;

  return `
    <div class="campaign-card">
      <div class="card-banner" style="${bannerStyle}">
        <div class="banner-shimmer"></div>
        <div class="banner-icon">${campaign.status === "active" ? "⚔️" : "🏔️"}</div>
        <div class="status-badge" style="background:${statusBg};color:${statusColor};border:none;font-weight:700;text-shadow:0 1px 2px rgba(0,0,0,0.3);">
          ${statusLabel}
        </div>
      </div>
      <div class="card-body">
        <div class="card-name">${escapeHtml(campaign.name)}</div>
        <div class="card-desc">${escapeHtml(campaign.description)}</div>
        <div class="card-meta">
          ${campaign.nextSession ? `
          <div class="meta-row">
            <span class="meta-icon">🗓</span>
            <span class="meta-label">Next Session</span>
            <span class="meta-value">${escapeHtml(campaign.nextSession.day)} · ${escapeHtml(campaign.nextSession.time)}</span>
          </div>` : `
          <div class="meta-row">
            <span class="meta-icon">⏸</span>
            <span class="meta-label">Next Session</span>
            <span class="meta-value" style="color:#475569;">Not scheduled</span>
          </div>`}
          <div class="meta-row" style="margin-top:10px;">
            <span class="meta-icon">👥</span>
            <span class="meta-label">Players</span>
            <span class="meta-value">${campaign.players.current} / ${campaign.players.max}</span>
          </div>
          <div class="player-bar-track">
            <div class="player-bar-fill" style="width:${playerPct}%;background:${campaign.status === "active" ? "linear-gradient(90deg,#1D4ED8,#3B82F6)" : "linear-gradient(90deg,#334155,#475569)"};"></div>
          </div>
        </div>
        ${isGm ? `
        <div class="card-gm-actions">
          <button class="btn-invite" onclick="copyInvite('${escapeHtml(campaign.inviteCode)}', this)">
            <span>📋</span> Copy Invite Code
          </button>
          <a href="/campaigns/editor?id=${escapeHtml(campaign.id)}" class="btn-edit">
            <span>✏️</span> Edit Campaign
          </a>
        </div>` : ""}
        <a href="/campaigns/${escapeHtml(campaign.id)}" class="btn-enter">Enter Campaign</a>
      </div>
    </div>`;
}

app.get("/campaigns", isAuthenticated, async (req, res) => {
  const user = req.user;
  const isGm = user.role === "gm";
  let campaigns = [];
  if (mongoose.connection.readyState) {
    try {
      const dbUser = await User.findOne({ providerId: user.id });
      const rawCampaigns = dbUser
        ? await Campaign.find({ $or: [{ gameMasterId: dbUser._id }, { status: "active" }] }).sort({ createdAt: -1 })
        : await Campaign.find({ status: "active" }).sort({ createdAt: -1 });
      campaigns = rawCampaigns.map(c => ({
        id: String(c._id),
        name: c.name || "Untitled Campaign",
        description: c.description || "",
        status: c.status || "active",
        inviteCode: c.inviteCode || "",
        imagePath: c.imagePath || null,
        players: { current: 0, max: c.maxPlayers || 4 },
        nextSession: c.schedule && c.schedule.dayOfWeek ? { day: c.schedule.dayOfWeek, time: c.schedule.time || "TBD" } : null,
      }));
    } catch (err) {
      console.error("Failed to fetch campaigns:", err.message);
    }
  }
  const hasCampaigns = campaigns.length > 0;

  const cardsHtml = hasCampaigns
    ? campaigns.map(c => renderCampaignCard(c, isGm)).join("")
    : "";

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Campaigns — Cartyx</title>
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      min-height: 100vh;
      background: #080A12;
      color: #E2E8F0;
      font-family: 'Inter', sans-serif;
      display: flex;
      flex-direction: column;
    }

    /* ── Topbar ── */
    .topbar {
      position: sticky;
      top: 0;
      z-index: 100;
      width: 100%;
      background: rgba(8,10,18,0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      padding: 0 32px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .topbar-brand {
      font-family: 'Press Start 2P', monospace;
      font-size: 11px;
      color: #fff;
      letter-spacing: 3px;
      text-decoration: none;
    }
    .topbar-right {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .topbar-avatar {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 2px solid rgba(59,130,246,0.4);
      object-fit: cover;
    }
    .topbar-avatar-placeholder {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 2px solid rgba(59,130,246,0.4);
      background: rgba(37,99,235,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
    }
    .topbar-name {
      font-size: 13px;
      color: #94A3B8;
      font-weight: 500;
    }
    .user-menu { position: relative; }
    .user-menu-trigger {
      display: flex; align-items: center; gap: 10px;
      cursor: pointer; padding: 6px 10px; border-radius: 10px;
      border: 1px solid transparent;
      transition: all 0.2s;
      user-select: none;
    }
    .user-menu-trigger:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); }
    .user-menu-arrow { color: #475569; font-size: 10px; transition: transform 0.2s; }
    .user-menu-trigger.open .user-menu-arrow { transform: rotate(180deg); }
    .user-menu-dropdown {
      display: none;
      position: absolute; top: calc(100% + 8px); right: 0;
      background: #0F1117;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 6px;
      min-width: 160px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      z-index: 100;
    }
    .user-menu-dropdown.open { display: block; }
    .user-menu-item {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 12px; border-radius: 8px;
      color: #94A3B8; font-size: 13px; font-family: 'Inter', sans-serif;
      text-decoration: none; cursor: pointer;
      transition: all 0.15s;
    }
    .user-menu-item:hover { background: rgba(255,255,255,0.05); color: #E2E8F0; }
    .user-menu-item.danger { color: #F87171; }
    .user-menu-item.danger:hover { background: rgba(248,113,113,0.08); }
    .topbar-divider {
      width: 1px;
      height: 20px;
      background: rgba(255,255,255,0.1);
    }
    .topbar-signout {
      font-size: 12px;
      color: #475569;
      text-decoration: none;
      transition: color 0.2s;
      font-weight: 500;
    }
    .topbar-signout:hover { color: #94A3B8; }

    /* ── Main ── */
    .main {
      flex: 1;
      width: 100%;
      max-width: 1160px;
      margin: 0 auto;
      padding: 48px 32px 80px;
    }

    /* ── Page header ── */
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 40px;
    }
    .page-title {
      font-family: 'Press Start 2P', monospace;
      font-size: 15px;
      color: #fff;
      letter-spacing: 2px;
    }
    .btn-create {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 22px;
      border-radius: 12px;
      border: none;
      background: linear-gradient(135deg, #1D4ED8 0%, #2563EB 60%, #3B82F6 100%);
      color: #fff;
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s;
      box-shadow: 0 2px 12px rgba(37,99,235,0.3);
    }
    .btn-create:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 24px rgba(37,99,235,0.5);
    }

    /* ── Campaign grid ── */
    .campaigns-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 24px;
    }

    /* ── Campaign card ── */
    .campaign-card {
      background: #0D1117;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
    }
    .campaign-card:hover {
      border-color: rgba(59,130,246,0.25);
      transform: translateY(-3px);
      box-shadow: 0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(59,130,246,0.1);
    }

    /* Banner */
    .card-banner {
      position: relative;
      height: 160px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .banner-shimmer {
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at 30% 40%, rgba(37,99,235,0.08) 0%, transparent 60%),
                  radial-gradient(ellipse at 70% 60%, rgba(99,102,241,0.05) 0%, transparent 60%);
      pointer-events: none;
    }
    .banner-icon {
      font-size: 48px;
      opacity: 0.35;
      filter: drop-shadow(0 0 20px rgba(59,130,246,0.3));
    }
    .status-badge {
      position: absolute;
      top: 14px;
      right: 14px;
      font-family: 'Press Start 2P', monospace;
      font-size: 7px;
      letter-spacing: 1px;
      padding: 5px 10px;
      border-radius: 6px;
    }

    /* Card body */
    .card-body {
      padding: 20px 20px 20px;
      display: flex;
      flex-direction: column;
      gap: 0;
      flex: 1;
    }
    .card-name {
      font-family: 'Press Start 2P', monospace;
      font-size: 11px;
      color: #F1F5F9;
      line-height: 1.6;
      margin-bottom: 10px;
    }
    .card-desc {
      font-size: 13px;
      color: #64748B;
      line-height: 1.6;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      margin-bottom: 18px;
    }
    .card-meta {
      margin-bottom: 16px;
    }
    .meta-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .meta-icon { font-size: 13px; }
    .meta-label {
      font-size: 11px;
      color: #475569;
      font-weight: 500;
      flex: 1;
    }
    .meta-value {
      font-size: 12px;
      color: #94A3B8;
      font-weight: 500;
    }
    .player-bar-track {
      margin-top: 7px;
      height: 4px;
      background: rgba(255,255,255,0.06);
      border-radius: 999px;
      overflow: hidden;
    }
    .player-bar-fill {
      height: 100%;
      border-radius: 999px;
      transition: width 0.4s ease;
    }

    /* GM action buttons */
    .card-gm-actions {
      display: flex;
      gap: 8px;
      margin-bottom: 10px;
    }
    .card-gm-actions .btn-invite {
      margin-bottom: 0;
      flex: 1;
    }
    .btn-edit {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      flex: 1;
      padding: 9px 16px;
      border-radius: 10px;
      border: 1px solid rgba(234,179,8,0.25);
      background: rgba(234,179,8,0.08);
      color: #FACC15;
      font-family: 'Inter', sans-serif;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s;
    }
    .btn-edit:hover {
      background: rgba(234,179,8,0.15);
      border-color: rgba(234,179,8,0.4);
    }

    /* Buttons */
    .btn-invite {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      padding: 9px 16px;
      margin-bottom: 10px;
      border-radius: 10px;
      border: 1px solid rgba(59,130,246,0.2);
      background: rgba(37,99,235,0.08);
      color: #60A5FA;
      font-family: 'Inter', sans-serif;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-invite:hover {
      background: rgba(37,99,235,0.15);
      border-color: rgba(59,130,246,0.4);
    }
    .btn-enter {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 12px 16px;
      border-radius: 12px;
      border: none;
      background: linear-gradient(135deg, #1D4ED8 0%, #2563EB 60%, #3B82F6 100%);
      color: #fff;
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s;
      box-shadow: 0 2px 10px rgba(37,99,235,0.25);
      margin-top: auto;
    }
    .btn-enter:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(37,99,235,0.45);
    }

    /* ── Empty state ── */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 60px 20px;
    }
    .empty-rogue {
      width: 380px;
      height: auto;
      object-fit: contain;
      image-rendering: pixelated;
      filter: sepia(1) hue-rotate(185deg) saturate(2) brightness(0.75);
      margin-bottom: 24px;
      border-radius: 12px;
    }
    .empty-title {
      font-family: 'Press Start 2P', monospace;
      font-size: 11px;
      color: #64748B;
      letter-spacing: 2px;
      margin-bottom: 14px;
      line-height: 1.8;
    }
    .empty-desc {
      font-size: 14px;
      color: #475569;
      margin-bottom: 32px;
      max-width: 360px;
      line-height: 1.7;
    }

    /* ── Toast ── */
    .toast {
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%) translateY(80px);
      background: #1E293B;
      border: 1px solid rgba(59,130,246,0.3);
      border-radius: 10px;
      padding: 12px 20px;
      font-size: 13px;
      color: #93C5FD;
      font-weight: 500;
      transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
      z-index: 999;
      white-space: nowrap;
    }
    .toast.show { transform: translateX(-50%) translateY(0); }

    @media (max-width: 640px) {
      .main { padding: 32px 16px 60px; }
      .topbar { padding: 0 16px; }
      .page-title { font-size: 11px; }
      .campaigns-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <nav class="topbar">
    <a href="/campaigns" class="topbar-brand">CARTYX</a>
    <div class="topbar-right">
      ${user.avatar
        ? `<img src="${escapeHtml(user.avatar)}" class="topbar-avatar" alt="">`
        : `<div class="topbar-avatar-placeholder">🧙</div>`}
      <div class="user-menu">
        <div class="user-menu-trigger" onclick="toggleMenu(this)">
          <span class="topbar-name">${escapeHtml(user.name || "")}</span>
          <span class="user-menu-arrow">▼</span>
        </div>
        <div class="user-menu-dropdown">
          <a href="/settings" class="user-menu-item">⚙️ Settings</a>
          <a href="/logout" class="user-menu-item danger">🚪 Sign Out</a>
        </div>
      </div>
    </div>
  </nav>

  <main class="main">
    <div class="page-header">
      <h1 class="page-title">MY CAMPAIGNS</h1>
      ${isGm ? `<a href="/campaigns/new" class="btn-create">⚔️ Create Campaign</a>` : ""}
    </div>

    ${hasCampaigns ? `
    <div class="campaigns-grid">
      ${cardsHtml}
    </div>` : `
    <div class="empty-state">
      <img src="/cartyx-rogue.png" class="empty-rogue" alt="Waiting rogue">
      <div class="empty-title">NO CAMPAIGNS YET</div>
      <div class="empty-desc">${isGm
        ? "Create your first campaign to get started."
        : "Ask your GM for an invite code to join a campaign."}</div>

    </div>`}
  </main>

  <div class="toast" id="toast"></div>

  <script>
    function copyInvite(code, btn) {
      navigator.clipboard.writeText(code).then(() => {
        const toast = document.getElementById('toast');
        toast.textContent = '✓ Invite code copied: ' + code;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2400);
      });
    }
    function toggleMenu(trigger) {
      trigger.classList.toggle('open');
      trigger.nextElementSibling.classList.toggle('open');
    }
    // Close menu when clicking outside
    document.addEventListener('click', e => {
      if (!e.target.closest('.user-menu')) {
        document.querySelectorAll('.user-menu-trigger.open').forEach(t => t.classList.remove('open'));
        document.querySelectorAll('.user-menu-dropdown.open').forEach(d => d.classList.remove('open'));
      }
    });
  </script>
</body>
</html>`);
});

// ---------------------------------------------------------------------------
// Campaign Editor
// ---------------------------------------------------------------------------

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${part()}-${part()}`;
}

function topbarHtml(user) {
  return `
  <nav class="topbar">
    <a href="/campaigns" class="topbar-brand">CARTYX</a>
    <div class="topbar-right">
      ${user.avatar
        ? `<img src="${escapeHtml(user.avatar)}" class="topbar-avatar" alt="">`
        : `<div class="topbar-avatar-placeholder">🧙</div>`}
      <div class="user-menu">
        <div class="user-menu-trigger" onclick="toggleMenu(this)">
          <span class="topbar-name">${escapeHtml(user.name || "")}</span>
          <span class="user-menu-arrow">▼</span>
        </div>
        <div class="user-menu-dropdown">
          <a href="/settings" class="user-menu-item">⚙️ Settings</a>
          <a href="/logout" class="user-menu-item danger">🚪 Sign Out</a>
        </div>
      </div>
    </div>
  </nav>`;
}

const TOPBAR_SHARED_CSS = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { min-height: 100vh; background: #080A12; color: #E2E8F0; font-family: 'Inter', sans-serif; display: flex; flex-direction: column; }
    .topbar { position: sticky; top: 0; z-index: 100; width: 100%; background: rgba(8,10,18,0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-bottom: 1px solid rgba(255,255,255,0.06); padding: 0 32px; height: 60px; display: flex; align-items: center; justify-content: space-between; }
    .topbar-brand { font-family: 'Press Start 2P', monospace; font-size: 11px; color: #fff; letter-spacing: 3px; text-decoration: none; }
    .topbar-right { display: flex; align-items: center; gap: 14px; }
    .topbar-avatar { width: 34px; height: 34px; border-radius: 50%; border: 2px solid rgba(59,130,246,0.4); object-fit: cover; }
    .topbar-avatar-placeholder { width: 34px; height: 34px; border-radius: 50%; border: 2px solid rgba(59,130,246,0.4); background: rgba(37,99,235,0.2); display: flex; align-items: center; justify-content: center; font-size: 14px; }
    .topbar-name { font-size: 13px; color: #94A3B8; font-weight: 500; }
    .user-menu { position: relative; }
    .user-menu-trigger { display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 6px 10px; border-radius: 10px; border: 1px solid transparent; transition: all 0.2s; user-select: none; }
    .user-menu-trigger:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); }
    .user-menu-arrow { color: #475569; font-size: 10px; transition: transform 0.2s; }
    .user-menu-trigger.open .user-menu-arrow { transform: rotate(180deg); }
    .user-menu-dropdown { display: none; position: absolute; top: calc(100% + 8px); right: 0; background: #0F1117; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 6px; min-width: 160px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); z-index: 100; }
    .user-menu-dropdown.open { display: block; }
    .user-menu-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; color: #94A3B8; font-size: 13px; font-family: 'Inter', sans-serif; text-decoration: none; cursor: pointer; transition: all 0.15s; }
    .user-menu-item:hover { background: rgba(255,255,255,0.05); color: #E2E8F0; }
    .user-menu-item.danger { color: #F87171; }
    .user-menu-item.danger:hover { background: rgba(248,113,113,0.08); }
`;

const TOPBAR_MENU_JS = `
    function toggleMenu(trigger) {
      trigger.classList.toggle('open');
      trigger.nextElementSibling.classList.toggle('open');
    }
    document.addEventListener('click', e => {
      if (!e.target.closest('.user-menu')) {
        document.querySelectorAll('.user-menu-trigger.open').forEach(t => t.classList.remove('open'));
        document.querySelectorAll('.user-menu-dropdown.open').forEach(d => d.classList.remove('open'));
      }
    });
`;

// ---------------------------------------------------------------------------
// GET /campaigns/new — Multi-step campaign creation wizard
// ---------------------------------------------------------------------------

app.get("/campaigns/new", isAuthenticated, (req, res) => {
  const user = req.user;
  if (user.role !== "gm") return res.redirect("/campaigns");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Campaign — Cartyx</title>
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    ${TOPBAR_SHARED_CSS}
    .main { flex: 1; width: 100%; max-width: 680px; margin: 0 auto; padding: 40px 24px 80px; }
    .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
    .page-title { font-family: 'Press Start 2P', monospace; font-size: 13px; color: #fff; letter-spacing: 2px; }
    .btn-back { font-size: 12px; color: #475569; text-decoration: none; transition: color 0.2s; font-weight: 500; }
    .btn-back:hover { color: #94A3B8; }
    /* ── Progress ── */
    .wizard-progress { margin-bottom: 32px; }
    .progress-track { display: flex; align-items: center; margin-bottom: 10px; }
    .step-dot { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; background: rgba(255,255,255,0.05); color: #475569; border: 2px solid rgba(255,255,255,0.08); transition: all 0.3s; flex-shrink: 0; }
    .step-dot.done { background: rgba(37,99,235,0.15); color: #60A5FA; border-color: rgba(59,130,246,0.4); }
    .step-dot.active { background: linear-gradient(135deg, #1D4ED8, #3B82F6); color: #fff; border-color: transparent; box-shadow: 0 0 16px rgba(59,130,246,0.4); }
    .progress-line { flex: 1; height: 2px; background: rgba(255,255,255,0.06); transition: background 0.3s; }
    .progress-line.done { background: rgba(59,130,246,0.4); }
    .progress-labels { display: flex; justify-content: space-between; }
    .progress-label { font-size: 7px; font-family: 'Press Start 2P', monospace; color: #334155; text-align: center; width: 32px; transition: color 0.3s; line-height: 1.6; }
    .progress-label.active { color: #60A5FA; }
    .progress-label.done { color: #3B82F6; }
    /* ── Wizard card ── */
    .wizard-card { background: #0D1117; border: 1px solid rgba(255,255,255,0.07); border-radius: 20px; overflow: hidden; }
    .wizard-viewport { overflow: hidden; }
    .wizard-track { display: flex; transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
    .step-panel { flex: 0 0 100%; min-width: 100%; padding: 32px 32px 24px; }
    .step-heading { font-family: 'Press Start 2P', monospace; font-size: 10px; color: #60A5FA; letter-spacing: 3px; margin-bottom: 28px; }
    /* ── Form elements ── */
    .form-group { margin-bottom: 22px; }
    .form-group label { display: block; font-size: 12px; font-weight: 600; color: #94A3B8; margin-bottom: 8px; letter-spacing: 0.5px; }
    .required { color: #F87171; }
    .optional { color: #475569; font-weight: 400; }
    .form-input { width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 12px 16px; color: #E2E8F0; font-size: 14px; font-family: 'Inter', sans-serif; transition: border-color 0.2s, background 0.2s; }
    .form-input:focus { outline: none; border-color: rgba(59,130,246,0.5); background: rgba(255,255,255,0.06); }
    .form-input::placeholder { color: #334155; }
    textarea.form-input { resize: vertical; min-height: 110px; }
    select.form-input { cursor: pointer; -webkit-appearance: none; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' fill='none'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2364748B' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 14px center; padding-right: 36px; }
    select.form-input option { background: #0D1117; }
    .char-counter { text-align: right; font-size: 11px; color: #334155; margin-top: 5px; }
    .char-counter.warn { color: #F59E0B; }
    /* ── Upload ── */
    .upload-zone { border: 2px dashed rgba(255,255,255,0.1); border-radius: 12px; padding: 28px; text-align: center; cursor: pointer; transition: all 0.2s; color: #475569; font-size: 13px; }
    .upload-zone:hover { border-color: rgba(59,130,246,0.4); background: rgba(37,99,235,0.04); color: #94A3B8; }
    .upload-icon { font-size: 28px; margin-bottom: 8px; }
    .upload-hint { font-size: 11px; color: #334155; margin-top: 4px; }
    .image-preview { max-width: 100%; max-height: 200px; border-radius: 8px; object-fit: cover; }
    /* ── Pills ── */
    .pill-group { display: flex; flex-wrap: wrap; gap: 8px; }
    .pill { padding: 8px 18px; border-radius: 99px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: #64748B; font-size: 13px; font-family: 'Inter', sans-serif; font-weight: 500; cursor: pointer; transition: all 0.2s; }
    .pill:hover { border-color: rgba(59,130,246,0.3); color: #94A3B8; }
    .pill.active { background: rgba(37,99,235,0.2); border-color: rgba(59,130,246,0.6); color: #93C5FD; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    /* ── Slot selector ── */
    .slot-selector { display: flex; flex-wrap: wrap; gap: 10px; }
    .slot-btn { width: 52px; height: 52px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: #64748B; font-size: 16px; font-weight: 700; font-family: 'Inter', sans-serif; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; }
    .slot-btn:hover { border-color: rgba(59,130,246,0.3); color: #94A3B8; }
    .slot-btn.active { background: rgba(37,99,235,0.25); border-color: rgba(59,130,246,0.7); color: #93C5FD; box-shadow: 0 0 12px rgba(59,130,246,0.2); }
    /* ── Review ── */
    .review-section { margin-bottom: 20px; }
    .review-section-title { font-size: 8px; font-family: 'Press Start 2P', monospace; color: #475569; letter-spacing: 2px; margin-bottom: 10px; }
    .review-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 14px 16px; }
    .review-row { display: flex; justify-content: space-between; align-items: flex-start; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
    .review-row:last-child { border-bottom: none; padding-bottom: 0; }
    .review-label { font-size: 11px; color: #475569; font-weight: 500; flex-shrink: 0; }
    .review-value { font-size: 12px; color: #94A3B8; text-align: right; max-width: 65%; word-break: break-word; }
    .review-value.empty { color: #334155; font-style: italic; }
    /* ── Footer ── */
    .wizard-footer { display: flex; align-items: center; justify-content: space-between; padding: 20px 32px 24px; border-top: 1px solid rgba(255,255,255,0.06); }
    .step-counter { font-size: 9px; color: #334155; font-family: 'Press Start 2P', monospace; }
    .btn-nav { padding: 11px 22px; border-radius: 10px; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .btn-nav-back { background: transparent; border: 1px solid rgba(255,255,255,0.1); color: #64748B; }
    .btn-nav-back:hover { border-color: rgba(255,255,255,0.2); color: #94A3B8; }
    .btn-nav-next, .btn-submit { border: none; background: linear-gradient(135deg, #1D4ED8 0%, #2563EB 60%, #3B82F6 100%); color: #fff; box-shadow: 0 2px 12px rgba(37,99,235,0.3); }
    .btn-nav-next:hover, .btn-submit:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(37,99,235,0.5); }
    .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    /* ── Error ── */
    .error-msg { background: rgba(248,113,113,0.1); border: 1px solid rgba(248,113,113,0.3); color: #FCA5A5; border-radius: 8px; padding: 12px 16px; font-size: 13px; margin-bottom: 16px; display: none; }
    @media (max-width: 640px) {
      .main { padding: 24px 16px 60px; } .topbar { padding: 0 16px; }
      .step-panel { padding: 24px 16px 16px; } .wizard-footer { padding: 16px 16px 20px; }
      .form-row { grid-template-columns: 1fr; } .progress-label { font-size: 5px; }
    }
  </style>
</head>
<body>
  ${topbarHtml(user)}

  <main class="main">
    <div class="page-header">
      <h1 class="page-title">NEW CAMPAIGN</h1>
      <a href="/campaigns" class="btn-back">&#8592; Back</a>
    </div>

    <div class="wizard-progress">
      <div class="progress-track">
        <div class="step-dot active" id="dot-1">1</div><div class="progress-line" id="line-1"></div>
        <div class="step-dot" id="dot-2">2</div><div class="progress-line" id="line-2"></div>
        <div class="step-dot" id="dot-3">3</div><div class="progress-line" id="line-3"></div>
        <div class="step-dot" id="dot-4">4</div><div class="progress-line" id="line-4"></div>
        <div class="step-dot" id="dot-5">5</div>
      </div>
      <div class="progress-labels">
        <span class="progress-label active" id="lbl-1">QUEST</span>
        <span class="progress-label" id="lbl-2">SCHEDULE</span>
        <span class="progress-label" id="lbl-3">GATHER</span>
        <span class="progress-label" id="lbl-4">ROSTER</span>
        <span class="progress-label" id="lbl-5">REVIEW</span>
      </div>
    </div>

    <div id="errorMsg" class="error-msg"></div>

    <div class="wizard-card">
      <div class="wizard-viewport">
        <div class="wizard-track" id="wizardTrack">

          <!-- Step 1: THE QUEST -->
          <div class="step-panel">
            <div class="step-heading">THE QUEST</div>
            <div class="form-group">
              <label for="f-name">Campaign Name <span class="required">*</span></label>
              <input type="text" id="f-name" class="form-input" maxlength="60" placeholder="Enter campaign name...">
              <div class="char-counter"><span id="cnt-name">0</span>/60</div>
            </div>
            <div class="form-group">
              <label for="f-desc">Description <span class="required">*</span></label>
              <textarea id="f-desc" class="form-input" maxlength="500" rows="4" placeholder="Describe your campaign world, tone, and what adventurers can expect..."></textarea>
              <div class="char-counter"><span id="cnt-desc">0</span>/500</div>
            </div>
            <div class="form-group">
              <label>Banner Image <span class="optional">(optional)</span></label>
              <div class="upload-zone" onclick="document.getElementById('f-image').click()">
                <div id="uploadPlaceholder">
                  <div class="upload-icon">&#128444;</div>
                  <div>Click to upload a banner image</div>
                  <div class="upload-hint">PNG, JPG, GIF up to 5MB &mdash; preview only</div>
                </div>
                <img id="imagePreview" class="image-preview" alt="Banner preview" style="display:none">
              </div>
              <input type="file" id="f-image" accept="image/*" style="display:none" onchange="handleImageUpload(this)">
            </div>
          </div>

          <!-- Step 2: THE SCHEDULE -->
          <div class="step-panel">
            <div class="step-heading">THE SCHEDULE</div>
            <div class="form-group">
              <label>Frequency</label>
              <div class="pill-group" id="pg-frequency">
                <button type="button" class="pill active" data-val="weekly" onclick="selectPill(this,'pg-frequency')">Weekly</button>
                <button type="button" class="pill" data-val="biweekly" onclick="selectPill(this,'pg-frequency')">Bi-weekly</button>
                <button type="button" class="pill" data-val="monthly" onclick="selectPill(this,'pg-frequency')">Monthly</button>
              </div>
            </div>
            <div class="form-group">
              <label>Day of Week</label>
              <div class="pill-group" id="pg-day">
                <button type="button" class="pill" data-val="Mon" onclick="selectPill(this,'pg-day')">Mon</button>
                <button type="button" class="pill" data-val="Tue" onclick="selectPill(this,'pg-day')">Tue</button>
                <button type="button" class="pill" data-val="Wed" onclick="selectPill(this,'pg-day')">Wed</button>
                <button type="button" class="pill" data-val="Thu" onclick="selectPill(this,'pg-day')">Thu</button>
                <button type="button" class="pill" data-val="Fri" onclick="selectPill(this,'pg-day')">Fri</button>
                <button type="button" class="pill active" data-val="Sat" onclick="selectPill(this,'pg-day')">Sat</button>
                <button type="button" class="pill" data-val="Sun" onclick="selectPill(this,'pg-day')">Sun</button>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="f-time">Time</label>
                <input type="time" id="f-time" class="form-input" value="19:00">
              </div>
              <div class="form-group">
                <label for="f-tz">Timezone</label>
                <select id="f-tz" class="form-input">
                  <option value="UTC">UTC</option>
                  <option value="EST">EST (UTC-5)</option>
                  <option value="CST">CST (UTC-6)</option>
                  <option value="MST">MST (UTC-7)</option>
                  <option value="PST" selected>PST (UTC-8)</option>
                  <option value="GMT">GMT</option>
                  <option value="CET">CET (UTC+1)</option>
                  <option value="GMT+2">GMT+2</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Step 3: THE GATHERING -->
          <div class="step-panel">
            <div class="step-heading">THE GATHERING</div>
            <div class="form-group">
              <label for="f-callUrl">Communication Link <span class="optional">(optional)</span></label>
              <input type="url" id="f-callUrl" class="form-input" placeholder="https://discord.gg/... or https://zoom.us/...">
            </div>
            <div class="form-group">
              <label for="f-dndUrl">D&amp;D Beyond Campaign URL <span class="optional">(optional)</span></label>
              <input type="url" id="f-dndUrl" class="form-input" placeholder="https://www.dndbeyond.com/campaigns/...">
            </div>
          </div>

          <!-- Step 4: THE ROSTER -->
          <div class="step-panel">
            <div class="step-heading">THE ROSTER</div>
            <div class="form-group">
              <label>Max Player Slots</label>
              <div class="slot-selector" id="slotSelector">
                <button type="button" class="slot-btn" data-val="1" onclick="selectSlot(this)">1</button>
                <button type="button" class="slot-btn" data-val="2" onclick="selectSlot(this)">2</button>
                <button type="button" class="slot-btn" data-val="3" onclick="selectSlot(this)">3</button>
                <button type="button" class="slot-btn active" data-val="4" onclick="selectSlot(this)">4</button>
                <button type="button" class="slot-btn" data-val="5" onclick="selectSlot(this)">5</button>
                <button type="button" class="slot-btn" data-val="6" onclick="selectSlot(this)">6</button>
                <button type="button" class="slot-btn" data-val="7" onclick="selectSlot(this)">7</button>
                <button type="button" class="slot-btn" data-val="8" onclick="selectSlot(this)">8</button>
                <button type="button" class="slot-btn" data-val="9" onclick="selectSlot(this)">9</button>
                <button type="button" class="slot-btn" data-val="10" onclick="selectSlot(this)">10</button>
              </div>
              <p style="font-size:12px;color:#334155;margin-top:14px;">The GM does not occupy a player slot.</p>
            </div>
          </div>

          <!-- Step 5: REVIEW -->
          <div class="step-panel">
            <div class="step-heading">REVIEW</div>
            <div id="review-content"></div>
          </div>

        </div>
      </div>
      <div class="wizard-footer">
        <button type="button" class="btn-nav btn-nav-back" id="btnBack" onclick="prevStep()" style="visibility:hidden">&#8592; Back</button>
        <span class="step-counter" id="stepCounter">1 / 5</span>
        <button type="button" class="btn-nav btn-nav-next" id="btnNext" onclick="nextStep()">Continue &#8594;</button>
        <button type="button" class="btn-nav btn-submit" id="btnSubmit" onclick="submitForm()" style="display:none">&#9876; Create Campaign</button>
      </div>
    </div>
  </main>

  <script>
    ${TOPBAR_MENU_JS}

    var currentStep = 1;
    var totalSteps = 5;

    function goToStep(n) {
      var vp = document.querySelector('.wizard-viewport');
      document.getElementById('wizardTrack').style.transform = 'translateX(-' + ((n - 1) * vp.offsetWidth) + 'px)';
      for (var i = 1; i <= totalSteps; i++) {
        document.getElementById('dot-' + i).className = 'step-dot' + (i === n ? ' active' : (i < n ? ' done' : ''));
        document.getElementById('lbl-' + i).className = 'progress-label' + (i === n ? ' active' : (i < n ? ' done' : ''));
        if (i < totalSteps) document.getElementById('line-' + i).className = 'progress-line' + (i < n ? ' done' : '');
      }
      document.getElementById('stepCounter').textContent = n + ' / ' + totalSteps;
      document.getElementById('btnBack').style.visibility = n === 1 ? 'hidden' : 'visible';
      document.getElementById('btnNext').style.display = n === totalSteps ? 'none' : '';
      document.getElementById('btnSubmit').style.display = n === totalSteps ? '' : 'none';
      document.getElementById('errorMsg').style.display = 'none';
      currentStep = n;
      if (n === totalSteps) renderReview();
    }

    function showError(msg) {
      var el = document.getElementById('errorMsg');
      el.textContent = msg; el.style.display = 'block';
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function validateStep(n) {
      document.getElementById('errorMsg').style.display = 'none';
      if (n === 1) {
        if (!document.getElementById('f-name').value.trim()) { showError('Campaign name is required.'); return false; }
        if (!document.getElementById('f-desc').value.trim()) { showError('Description is required.'); return false; }
      }
      return true;
    }

    function nextStep() { if (validateStep(currentStep) && currentStep < totalSteps) goToStep(currentStep + 1); }
    function prevStep() { if (currentStep > 1) goToStep(currentStep - 1); }

    function selectPill(btn, groupId) {
      document.getElementById(groupId).querySelectorAll('.pill').forEach(function(p) { p.classList.remove('active'); });
      btn.classList.add('active');
    }

    function selectSlot(btn) {
      document.querySelectorAll('.slot-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
    }

    function handleImageUpload(input) {
      var file = input.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { showError('Image must be under 5MB.'); return; }
      var reader = new FileReader();
      reader.onload = function(e) {
        document.getElementById('imagePreview').src = e.target.result;
        document.getElementById('imagePreview').style.display = 'block';
        document.getElementById('uploadPlaceholder').style.display = 'none';
      };
      reader.readAsDataURL(file);
    }

    function getFormData() {
      var freq = document.querySelector('#pg-frequency .pill.active');
      var day  = document.querySelector('#pg-day .pill.active');
      var slot = document.querySelector('#slotSelector .slot-btn.active');
      return {
        name:        document.getElementById('f-name').value.trim(),
        description: document.getElementById('f-desc').value.trim(),
        schedFreq:   freq ? freq.dataset.val : 'weekly',
        schedDay:    day  ? day.dataset.val  : '',
        schedTime:   document.getElementById('f-time').value,
        schedTz:     document.getElementById('f-tz').value,
        callUrl:     document.getElementById('f-callUrl').value.trim(),
        dndBeyondUrl: document.getElementById('f-dndUrl').value.trim(),
        maxPlayers:  slot ? parseInt(slot.dataset.val) : 4
      };
    }

    function esc(s) {
      return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function renderReview() {
      var d = getFormData();
      var freqMap = { weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly' };
      var timeStr = d.schedTime ? (d.schedTime + ' ' + d.schedTz) : 'Not set';
      var descShort = d.description.length > 80 ? d.description.substring(0, 80) + '...' : d.description;
      var html = '';
      html += '<div class="review-section"><div class="review-section-title">THE QUEST</div><div class="review-card">';
      html += '<div class="review-row"><span class="review-label">Name</span><span class="review-value">' + esc(d.name) + '</span></div>';
      html += '<div class="review-row"><span class="review-label">Description</span><span class="review-value">' + esc(descShort) + '</span></div>';
      html += '</div></div>';
      html += '<div class="review-section"><div class="review-section-title">THE SCHEDULE</div><div class="review-card">';
      html += '<div class="review-row"><span class="review-label">Frequency</span><span class="review-value">' + esc(freqMap[d.schedFreq] || d.schedFreq) + '</span></div>';
      html += '<div class="review-row"><span class="review-label">Day</span><span class="review-value' + (d.schedDay ? '' : ' empty') + '">' + esc(d.schedDay || 'Not set') + '</span></div>';
      html += '<div class="review-row"><span class="review-label">Time</span><span class="review-value' + (d.schedTime ? '' : ' empty') + '">' + esc(timeStr) + '</span></div>';
      html += '</div></div>';
      html += '<div class="review-section"><div class="review-section-title">THE GATHERING</div><div class="review-card">';
      html += '<div class="review-row"><span class="review-label">Communication</span><span class="review-value' + (d.callUrl ? '' : ' empty') + '">' + esc(d.callUrl || 'None') + '</span></div>';
      html += '<div class="review-row"><span class="review-label">D&amp;D Beyond</span><span class="review-value' + (d.dndBeyondUrl ? '' : ' empty') + '">' + esc(d.dndBeyondUrl || 'None') + '</span></div>';
      html += '</div></div>';
      html += '<div class="review-section"><div class="review-section-title">THE ROSTER</div><div class="review-card">';
      html += '<div class="review-row"><span class="review-label">Max Players</span><span class="review-value">' + d.maxPlayers + ' players</span></div>';
      html += '</div></div>';
      document.getElementById('review-content').innerHTML = html;
    }

    async function submitForm() {
      var btn = document.getElementById('btnSubmit');
      btn.disabled = true; btn.textContent = 'Creating...';
      try {
        var d = getFormData();
        var formData = new FormData();
        Object.keys(d).forEach(function(k) { formData.append(k, d[k]); });
        var fileInput = document.getElementById('f-image');
        if (fileInput && fileInput.files[0]) formData.append('bannerImage', fileInput.files[0]);
        var resp = await fetch('/api/campaigns', {
          method: 'POST',
          body: formData
        });
        var result = await resp.json();
        if (result.success) {
          window.location.href = '/campaigns/summary/' + result.campaignId;
        } else if (result.redirectTo) {
          window.location.href = result.redirectTo;
        } else {
          showError(result.error || 'Failed to create campaign.');
          btn.disabled = false; btn.textContent = 'Create Campaign';
        }
      } catch (e) {
        showError('Network error. Please try again.');
        btn.disabled = false; btn.textContent = 'Create Campaign';
      }
    }

    document.getElementById('f-name').addEventListener('input', function() {
      var el = document.getElementById('cnt-name');
      el.textContent = this.value.length;
      el.parentElement.className = 'char-counter' + (this.value.length > 50 ? ' warn' : '');
    });
    document.getElementById('f-desc').addEventListener('input', function() {
      var el = document.getElementById('cnt-desc');
      el.textContent = this.value.length;
      el.parentElement.className = 'char-counter' + (this.value.length > 450 ? ' warn' : '');
    });
  </script>
</body>
</html>`);
});

// GET /campaigns/editor
app.get("/campaigns/editor", isAuthenticated, async (req, res) => {
  const user = req.user;
  const campaignId = req.query.id;
  let campaign = null;
  let errorMsg = null;

  if (campaignId) {
    if (!mongoose.connection.readyState) {
      errorMsg = "Database not available.";
    } else {
      try {
        const dbUser = await User.findOne({ providerId: user.id });
        campaign = await Campaign.findById(campaignId);
        if (!campaign) {
          errorMsg = "Campaign not found.";
          campaign = null;
        } else if (!dbUser || String(campaign.gameMasterId) !== String(dbUser._id)) {
          return res.status(403).send("Forbidden");
        }
      } catch (e) {
        errorMsg = "Invalid campaign ID.";
        campaign = null;
      }
    }
  }

  const isEdit = !!campaign;
  const v = (field, fallback = "") => isEdit ? escapeHtml(String(campaign[field] || fallback)) : fallback;

  const schedFreq = isEdit ? (campaign.schedule && campaign.schedule.frequency || "") : "";
  const schedDay = isEdit ? (campaign.schedule && campaign.schedule.dayOfWeek || "") : "";
  const schedTime = isEdit ? (campaign.schedule && campaign.schedule.time || "") : "";
  const schedTz = isEdit ? (campaign.schedule && campaign.schedule.timezone || "") : "America/New_York";
  const maxPlayers = isEdit ? (campaign.maxPlayers || 4) : 4;

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const timezones = [
    ["America/New_York", "ET (New York)"],
    ["America/Chicago", "CT (Chicago)"],
    ["America/Denver", "MT (Denver)"],
    ["America/Los_Angeles", "PT (Los Angeles)"],
    ["America/Anchorage", "AKT (Anchorage)"],
    ["Pacific/Honolulu", "HST (Honolulu)"],
    ["Europe/London", "GMT (London)"],
    ["Europe/Paris", "CET (Paris)"],
    ["Europe/Berlin", "CET (Berlin)"],
    ["Asia/Tokyo", "JST (Tokyo)"],
    ["Asia/Sydney", "AEST (Sydney)"],
    ["UTC", "UTC"],
  ];

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isEdit ? "Edit Campaign" : "New Campaign"} — Cartyx</title>
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    ${TOPBAR_SHARED_CSS}
    .main { flex: 1; width: 100%; max-width: 760px; margin: 0 auto; padding: 48px 32px 100px; }
    .back-link { display: inline-flex; align-items: center; gap: 6px; color: #475569; font-size: 13px; text-decoration: none; margin-bottom: 32px; transition: color 0.2s; }
    .back-link:hover { color: #94A3B8; }
    .page-title { font-family: 'Press Start 2P', monospace; font-size: 13px; color: #fff; letter-spacing: 2px; margin-bottom: 36px; line-height: 1.8; }
    .section-card { background: #0D1117; border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; padding: 28px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
    .section-heading { font-family: 'Press Start 2P', monospace; font-size: 8px; color: #3B82F6; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 20px; }
    .field { margin-bottom: 20px; }
    .field:last-child { margin-bottom: 0; }
    label { display: block; font-size: 12px; font-weight: 600; color: #94A3B8; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    input[type="text"], input[type="number"], input[type="time"], textarea, select {
      width: 100%; padding: 12px 14px; border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.1); background: #080A12;
      color: #E2E8F0; font-family: 'Inter', sans-serif; font-size: 14px;
      outline: none; transition: border-color 0.2s, box-shadow 0.2s;
    }
    input[type="text"]:focus, input[type="number"]:focus, input[type="time"]:focus, textarea:focus, select:focus {
      border-color: rgba(59,130,246,0.5); box-shadow: 0 0 0 3px rgba(59,130,246,0.1);
    }
    textarea { resize: vertical; min-height: 100px; }
    select option { background: #0D1117; }
    .file-upload-area { border: 1.5px dashed rgba(255,255,255,0.12); border-radius: 12px; padding: 28px 20px; text-align: center; cursor: pointer; transition: border-color 0.2s, background 0.2s; position: relative; overflow: hidden; }
    .file-upload-area:hover { border-color: rgba(59,130,246,0.4); background: rgba(59,130,246,0.04); }
    .file-upload-area input[type="file"] { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
    .upload-icon { font-size: 28px; margin-bottom: 8px; }
    .upload-hint { font-size: 13px; color: #475569; }
    .upload-hint span { color: #3B82F6; }
    .banner-preview { width: 100%; max-height: 180px; object-fit: cover; border-radius: 10px; margin-top: 14px; display: none; }
    .pills { display: flex; flex-wrap: wrap; gap: 8px; }
    .pill { padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: #64748B; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s; user-select: none; }
    .pill:hover { border-color: rgba(59,130,246,0.3); color: #94A3B8; }
    .pill.active { border-color: #3B82F6; background: rgba(37,99,235,0.15); color: #60A5FA; }
    .schedule-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
    .max-players-btns { display: flex; flex-wrap: wrap; gap: 8px; }
    .mp-btn { width: 42px; height: 42px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: #64748B; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.15s; font-family: 'Inter', sans-serif; }
    .mp-btn:hover { border-color: rgba(59,130,246,0.3); color: #94A3B8; }
    .mp-btn.active { border-color: #3B82F6; background: rgba(37,99,235,0.2); color: #60A5FA; }
    .error-msg { background: rgba(248,113,113,0.1); border: 1px solid rgba(248,113,113,0.3); border-radius: 10px; padding: 12px 16px; color: #F87171; font-size: 13px; margin-bottom: 20px; }
    .submit-btn { width: 100%; padding: 16px; border-radius: 14px; border: none; background: linear-gradient(135deg, #1D4ED8 0%, #2563EB 60%, #3B82F6 100%); color: #fff; font-family: 'Inter', sans-serif; font-size: 15px; font-weight: 700; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 20px rgba(37,99,235,0.35); margin-top: 8px; }
    .submit-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(37,99,235,0.5); }
    .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    @media (max-width: 640px) { .main { padding: 32px 16px 80px; } .topbar { padding: 0 16px; } .schedule-row { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  ${topbarHtml(user)}
  <main class="main">
    <a href="/campaigns" class="back-link">← Back to Campaigns</a>
    <h1 class="page-title">${isEdit ? "EDIT CAMPAIGN" : "NEW CAMPAIGN"}</h1>

    ${errorMsg ? `<div class="error-msg">${escapeHtml(errorMsg)}</div>` : ""}

    <div class="section-card">
      <div class="section-heading">Basic Info</div>
      <div class="field">
        <label for="name">Campaign Name *</label>
        <input type="text" id="name" value="${v("name")}" placeholder="The Lost Mines of Phandelver" required>
      </div>
      <div class="field">
        <label for="description">Description *</label>
        <textarea id="description" placeholder="Tell your players what awaits them...">${isEdit ? escapeHtml(campaign.description || "") : ""}</textarea>
      </div>
    </div>

    <div class="section-card">
      <div class="section-heading">Banner Image</div>
      <div class="field">
        <div class="file-upload-area" id="uploadArea">
          <input type="file" id="bannerFile" accept="image/*">
          <div class="upload-icon">🖼️</div>
          <div class="upload-hint">Drop an image here or <span>browse</span></div>
          <div class="upload-hint" style="margin-top:4px;font-size:11px;">PNG, JPG, WEBP · max 5MB</div>
        </div>
        ${isEdit && campaign.imagePath ? `<img src="${escapeHtml(campaign.imagePath)}" class="banner-preview" id="bannerPreview" style="display:block;">` : `<img class="banner-preview" id="bannerPreview">`}
      </div>
    </div>

    <div class="section-card">
      <div class="section-heading">Schedule</div>
      <div class="field">
        <label>Frequency</label>
        <div class="pills" id="freqPills">
          ${["Weekly", "Bi-weekly", "Monthly"].map(f =>
            `<div class="pill${schedFreq === f ? " active" : ""}" data-val="${f}" onclick="selectPill('freqPills',this)">${f}</div>`
          ).join("")}
        </div>
        <input type="hidden" id="schedFreq" value="${escapeHtml(schedFreq)}">
      </div>
      <div class="field">
        <label>Day of Week</label>
        <div class="pills" id="dayPills">
          ${days.map(d =>
            `<div class="pill${schedDay === d ? " active" : ""}" data-val="${d}" onclick="selectPill('dayPills',this)">${d}</div>`
          ).join("")}
        </div>
        <input type="hidden" id="schedDay" value="${escapeHtml(schedDay)}">
      </div>
      <div class="schedule-row">
        <div class="field" style="margin-bottom:0">
          <label for="schedTime">Time</label>
          <input type="time" id="schedTime" value="${escapeHtml(schedTime)}">
        </div>
        <div class="field" style="margin-bottom:0">
          <label for="schedTz">Timezone</label>
          <select id="schedTz">
            ${timezones.map(([val, label]) =>
              `<option value="${val}"${schedTz === val ? " selected" : ""}>${escapeHtml(label)}</option>`
            ).join("")}
          </select>
        </div>
      </div>
    </div>

    <div class="section-card">
      <div class="section-heading">Links</div>
      <div class="field">
        <label for="callUrl">Communication URL</label>
        <input type="text" id="callUrl" value="${v("callUrl")}" placeholder="Discord invite or Zoom link">
      </div>
      <div class="field">
        <label for="dndBeyondUrl">D&amp;D Beyond URL</label>
        <input type="text" id="dndBeyondUrl" value="${v("dndBeyondUrl")}" placeholder="D&D Beyond campaign link">
      </div>
    </div>

    <div class="section-card">
      <div class="section-heading">Players</div>
      <div class="field">
        <label>Max Players</label>
        <div class="max-players-btns" id="maxPlayersBtns">
          ${Array.from({ length: 10 }, (_, i) => i + 1).map(n =>
            `<button type="button" class="mp-btn${maxPlayers === n ? " active" : ""}" data-val="${n}" onclick="selectMaxPlayers(this)">${n}</button>`
          ).join("")}
        </div>
        <input type="hidden" id="maxPlayers" value="${maxPlayers}">
      </div>
    </div>

    <button class="submit-btn" id="submitBtn" onclick="submitForm()">
      ${isEdit ? "Save Changes" : "Create Campaign"}
    </button>
  </main>

  <script>
    ${TOPBAR_MENU_JS}

    function selectPill(groupId, el) {
      document.querySelectorAll('#' + groupId + ' .pill').forEach(p => p.classList.remove('active'));
      el.classList.add('active');
      const inputId = groupId === 'freqPills' ? 'schedFreq' : 'schedDay';
      document.getElementById(inputId).value = el.dataset.val;
    }

    function selectMaxPlayers(btn) {
      document.querySelectorAll('#maxPlayersBtns .mp-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('maxPlayers').value = btn.dataset.val;
    }

    document.getElementById('bannerFile').addEventListener('change', function() {
      const file = this.files[0];
      if (!file) return;
      const preview = document.getElementById('bannerPreview');
      preview.src = URL.createObjectURL(file);
      preview.style.display = 'block';
    });

    async function submitForm() {
      const btn = document.getElementById('submitBtn');
      btn.disabled = true;
      btn.textContent = 'Saving…';

      const formData = new FormData();
      formData.append('name', document.getElementById('name').value.trim());
      formData.append('description', document.getElementById('description').value.trim());
      formData.append('schedFreq', document.getElementById('schedFreq').value);
      formData.append('schedDay', document.getElementById('schedDay').value);
      formData.append('schedTime', document.getElementById('schedTime').value);
      formData.append('schedTz', document.getElementById('schedTz').value);
      formData.append('callUrl', document.getElementById('callUrl').value.trim());
      formData.append('dndBeyondUrl', document.getElementById('dndBeyondUrl').value.trim());
      formData.append('maxPlayers', document.getElementById('maxPlayers').value);

      const fileInput = document.getElementById('bannerFile');
      if (fileInput.files[0]) formData.append('bannerImage', fileInput.files[0]);

      const isEdit = ${isEdit ? "true" : "false"};
      const campaignId = ${isEdit ? `"${escapeHtml(String(campaign._id))}"` : "null"};

      try {
        const url = isEdit ? '/api/campaigns/' + campaignId : '/api/campaigns';
        const method = isEdit ? 'PUT' : 'POST';
        const fetchRes = await fetch(url, { method, body: formData });
        const data = await fetchRes.json();
        if (data.redirectTo) {
          window.location.href = data.redirectTo;
        } else if (data.error) {
          btn.disabled = false;
          btn.textContent = isEdit ? 'Save Changes' : 'Create Campaign';
          alert('Error: ' + data.error);
        }
      } catch (e) {
        btn.disabled = false;
        btn.textContent = isEdit ? 'Save Changes' : 'Create Campaign';
        alert('Something went wrong. Please try again.');
      }
    }
  </script>
</body>
</html>`);
});

// POST /api/campaigns — create
app.post("/api/campaigns", isAuthenticated, uploadCampaignImage.single("bannerImage"), async (req, res) => {
  if (req.user.role !== "gm") {
    return res.status(403).json({ error: "Only GMs can create campaigns." });
  }
  if (!mongoose.connection.readyState) {
    return res.status(503).json({ error: "Database not available." });
  }
  const { name, description, schedFreq, schedDay, schedTime, schedTz, callUrl, dndBeyondUrl, maxPlayers } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Campaign name is required." });
  }

  try {
    const dbUser = await User.findOne({ providerId: req.user.id });
    if (!dbUser) return res.status(400).json({ error: "User not found." });

    let inviteCode;
    let attempts = 0;
    do {
      inviteCode = generateInviteCode();
      attempts++;
    } while (attempts < 10 && await Campaign.exists({ inviteCode }));

    const imagePath = req.file ? `/uploads/campaigns/${req.file.filename}` : null;

    const campaign = await Campaign.create({
      gameMasterId: dbUser._id,
      name: name.trim(),
      description: description ? description.trim() : "",
      imagePath,
      schedule: { frequency: schedFreq || null, dayOfWeek: schedDay || null, time: schedTime || null, timezone: schedTz || null },
      callUrl: callUrl || null,
      dndBeyondUrl: dndBeyondUrl || null,
      maxPlayers: parseInt(maxPlayers) || 4,
      inviteCode,
    });

    res.json({ success: true, campaignId: String(campaign._id), inviteCode, redirectTo: `/campaigns/summary/${campaign._id}` });
  } catch (err) {
    console.error("POST /api/campaigns error:", err.message);
    res.status(500).json({ error: "Failed to create campaign." });
  }
});

// PUT /api/campaigns/:id — update
app.put("/api/campaigns/:id", isAuthenticated, uploadCampaignImage.single("bannerImage"), async (req, res) => {
  if (!mongoose.connection.readyState) {
    return res.status(503).json({ error: "Database not available." });
  }
  try {
    const dbUser = await User.findOne({ providerId: req.user.id });
    if (!dbUser) return res.status(400).json({ error: "User not found." });

    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    if (String(campaign.gameMasterId) !== String(dbUser._id)) {
      return res.status(403).json({ error: "Forbidden." });
    }

    const { name, description, schedFreq, schedDay, schedTime, schedTz, callUrl, dndBeyondUrl, maxPlayers } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Campaign name is required." });

    campaign.name = name.trim();
    campaign.description = description ? description.trim() : "";
    campaign.schedule = { frequency: schedFreq || null, dayOfWeek: schedDay || null, time: schedTime || null, timezone: schedTz || null };
    campaign.callUrl = callUrl || null;
    campaign.dndBeyondUrl = dndBeyondUrl || null;
    campaign.maxPlayers = parseInt(maxPlayers) || 4;
    campaign.updatedAt = new Date();
    if (req.file) campaign.imagePath = `/uploads/campaigns/${req.file.filename}`;

    await campaign.save();
    res.json({ redirectTo: `/campaigns/summary/${campaign._id}` });
  } catch (err) {
    console.error("PUT /api/campaigns/:id error:", err.message);
    res.status(500).json({ error: "Failed to update campaign." });
  }
});

// GET /campaigns/summary/:id
app.get("/campaigns/summary/:id", isAuthenticated, async (req, res) => {
  const user = req.user;
  if (!mongoose.connection.readyState) {
    return res.status(503).send("Database not available.");
  }
  let campaign;
  try {
    campaign = await Campaign.findById(req.params.id);
  } catch (e) {
    return res.status(404).send("Campaign not found.");
  }
  if (!campaign) return res.status(404).send("Campaign not found.");

  const dbUser = await User.findOne({ providerId: user.id });
  const isOwner = dbUser && String(campaign.gameMasterId) === String(dbUser._id);

  const freqLabel = campaign.schedule && campaign.schedule.frequency ? campaign.schedule.frequency : null;
  const dayLabel = campaign.schedule && campaign.schedule.dayOfWeek ? campaign.schedule.dayOfWeek : null;
  const timeLabel = campaign.schedule && campaign.schedule.time ? campaign.schedule.time : null;
  const tzLabel = campaign.schedule && campaign.schedule.timezone ? campaign.schedule.timezone : null;
  const scheduleText = [freqLabel, dayLabel, timeLabel, tzLabel].filter(Boolean).join(" · ") || "Not scheduled";

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(campaign.name)} — Cartyx</title>
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    ${TOPBAR_SHARED_CSS}
    .main { flex: 1; width: 100%; max-width: 640px; margin: 0 auto; padding: 48px 32px 100px; }
    .back-link { display: inline-flex; align-items: center; gap: 6px; color: #475569; font-size: 13px; text-decoration: none; margin-bottom: 32px; transition: color 0.2s; }
    .back-link:hover { color: #94A3B8; }
    .summary-card { background: #0D1117; border: 1px solid rgba(255,255,255,0.07); border-radius: 20px; padding: 36px; box-shadow: 0 8px 40px rgba(0,0,0,0.4); }
    .campaign-name { font-family: 'Press Start 2P', monospace; font-size: 12px; color: #F1F5F9; line-height: 1.8; margin-bottom: 12px; }
    .campaign-desc { font-size: 14px; color: #64748B; line-height: 1.7; margin-bottom: 28px; }
    .banner-img { width: 100%; max-height: 200px; object-fit: cover; border-radius: 12px; margin-bottom: 24px; }
    .invite-section { text-align: center; padding: 28px 20px; background: rgba(37,99,235,0.06); border: 1px solid rgba(59,130,246,0.15); border-radius: 14px; margin-bottom: 24px; }
    .invite-label { font-family: 'Press Start 2P', monospace; font-size: 7px; color: #3B82F6; letter-spacing: 2px; margin-bottom: 16px; }
    .invite-code { font-family: 'Press Start 2P', monospace; font-size: 22px; color: #fff; letter-spacing: 6px; margin-bottom: 20px; line-height: 1.6; }
    .copy-btn { display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; border-radius: 12px; border: 1px solid rgba(59,130,246,0.3); background: rgba(37,99,235,0.12); color: #60A5FA; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .copy-btn:hover { background: rgba(37,99,235,0.2); border-color: rgba(59,130,246,0.5); }
    .meta-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .meta-icon { font-size: 14px; width: 22px; text-align: center; }
    .meta-label { font-size: 12px; color: #475569; font-weight: 500; flex: 1; }
    .meta-value { font-size: 13px; color: #94A3B8; font-weight: 500; }
    .actions { display: flex; gap: 12px; margin-top: 28px; flex-wrap: wrap; }
    .btn-primary { flex: 1; min-width: 140px; padding: 14px 20px; border-radius: 12px; border: none; background: linear-gradient(135deg, #1D4ED8 0%, #2563EB 60%, #3B82F6 100%); color: #fff; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 700; cursor: pointer; text-decoration: none; text-align: center; transition: all 0.2s; box-shadow: 0 3px 14px rgba(37,99,235,0.3); display: flex; align-items: center; justify-content: center; }
    .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 22px rgba(37,99,235,0.45); }
    .btn-secondary { flex: 1; min-width: 140px; padding: 14px 20px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: #94A3B8; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; text-decoration: none; text-align: center; transition: all 0.15s; display: flex; align-items: center; justify-content: center; }
    .btn-secondary:hover { background: rgba(255,255,255,0.04); color: #E2E8F0; }
    .toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%) translateY(80px); background: #1E293B; border: 1px solid rgba(59,130,246,0.3); border-radius: 10px; padding: 12px 20px; font-size: 13px; color: #93C5FD; font-weight: 500; transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1); z-index: 999; white-space: nowrap; }
    .toast.show { transform: translateX(-50%) translateY(0); }
    @media (max-width: 640px) { .main { padding: 32px 16px 80px; } .topbar { padding: 0 16px; } .invite-code { font-size: 16px; letter-spacing: 4px; } }
  </style>
</head>
<body>
  ${topbarHtml(user)}
  <main class="main">
    <a href="/campaigns" class="back-link">← Back to Campaigns</a>
    <div class="summary-card">
      ${campaign.imagePath ? `<img src="${escapeHtml(campaign.imagePath)}" class="banner-img" alt="">` : ""}
      <div class="campaign-name">${escapeHtml(campaign.name)}</div>
      ${campaign.description ? `<div class="campaign-desc">${escapeHtml(campaign.description)}</div>` : ""}

      <div class="invite-section">
        <div class="invite-label">INVITE CODE</div>
        <div class="invite-code" id="inviteCode">${escapeHtml(campaign.inviteCode || "—")}</div>
        <button class="copy-btn" onclick="copyCode()">📋 Copy Code</button>
      </div>

      <div class="meta-row">
        <span class="meta-icon">🗓</span>
        <span class="meta-label">Schedule</span>
        <span class="meta-value">${escapeHtml(scheduleText)}</span>
      </div>
      <div class="meta-row">
        <span class="meta-icon">👥</span>
        <span class="meta-label">Max Players</span>
        <span class="meta-value">${campaign.maxPlayers}</span>
      </div>
      ${campaign.callUrl ? `<div class="meta-row"><span class="meta-icon">💬</span><span class="meta-label">Communication</span><span class="meta-value"><a href="${escapeHtml(campaign.callUrl)}" target="_blank" rel="noopener" style="color:#60A5FA;">Link</a></span></div>` : ""}
      ${campaign.dndBeyondUrl ? `<div class="meta-row"><span class="meta-icon">📖</span><span class="meta-label">D&amp;D Beyond</span><span class="meta-value"><a href="${escapeHtml(campaign.dndBeyondUrl)}" target="_blank" rel="noopener" style="color:#60A5FA;">Link</a></span></div>` : ""}

      <div class="actions">
        <a href="/campaigns" class="btn-primary">View All Campaigns</a>
        ${isOwner ? `<a href="/campaigns/editor?id=${escapeHtml(String(campaign._id))}" class="btn-secondary">Edit Campaign</a>` : ""}
      </div>
    </div>
  </main>

  <div class="toast" id="toast"></div>

  <script>
    ${TOPBAR_MENU_JS}
    function copyCode() {
      const code = document.getElementById('inviteCode').textContent;
      navigator.clipboard.writeText(code).then(() => {
        const toast = document.getElementById('toast');
        toast.textContent = '✓ Invite code copied: ' + code;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2400);
      });
    }
  </script>
</body>
</html>`);
});

// Keep /dashboard as alias
app.get("/dashboard", isAuthenticated, (req, res) => {
  const user = req.user;
  const expiresAt = req.session.sessionExpiresAt
    ? new Date(req.session.sessionExpiresAt).toISOString()
    : "unknown";
  const expiresIn = req.session.sessionExpiresAt
    ? Math.max(0, Math.round((req.session.sessionExpiresAt - Date.now()) / 1000 / 60))
    : null;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard — New World</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&display=swap');
    body { min-height:100vh; background:linear-gradient(135deg, #0E101C 0%, #10121E 100%); color:#c9b89e;
           font-family:'Cinzel','Segoe UI',system-ui,sans-serif;
           display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px; }
    .logo { width:100px; height:100px; object-fit:contain; }
    .card { background:linear-gradient(135deg, #0E101C 0%, #10121E 100%); border:1px solid rgba(100,160,220,0.15); border-radius:16px;
            padding:2.5rem; max-width:520px; width:90%; text-align:center; }
    h1 { color:#e8d5b7; font-size:1.6rem; margin-bottom:.25rem; }
    .subtitle { color:#8a7a6a; font-size:.85rem; margin-bottom:1.5rem; }
    .avatar { width:80px; height:80px; border-radius:50%; border:3px solid #d4a853;
              margin:0 auto 1rem; display:block; object-fit:cover; }
    .no-avatar { width:80px; height:80px; border-radius:50%; border:3px solid #d4a853;
                 margin:0 auto 1rem; display:flex; align-items:center; justify-content:center;
                 background:#2a2218; font-size:2rem; }
    .info { text-align:left; background:#13100c; border-radius:8px; padding:1rem 1.25rem;
            margin:1rem 0; font-size:.9rem; line-height:1.8; }
    .info .label { color:#8a7a6a; }
    .info .value { color:#e8d5b7; }
    .badge { display:inline-block; padding:.15rem .5rem; border-radius:4px;
             font-size:.75rem; font-weight:600; text-transform:uppercase; }
    .badge.google { background:#4285f422; color:#8ab4f8; border:1px solid #4285f444; }
    .badge.github { background:#f0f6fc11; color:#c9d1d9; border:1px solid #30363d; }
    .badge.apple  { background:#ffffff11; color:#f5f5f7; border:1px solid #48484a; }
    .session-info { background:#1e1a14; border:1px solid #332b20; border-radius:8px;
                    padding:.75rem 1rem; margin:1rem 0; font-size:.8rem; color:#8a7a6a; }
    .session-info strong { color:#c9b89e; }
    .actions { display:flex; gap:.75rem; justify-content:center; margin-top:1.5rem; }
    .btn { padding:.6rem 1.5rem; border-radius:8px; border:none; cursor:pointer;
           font-size:.9rem; font-weight:500; text-decoration:none; transition:all .2s; }
    .btn-refresh { background:#2a4a2a; color:#7ec87e; border:1px solid #3a6a3a; }
    .btn-refresh:hover { background:#3a5a3a; }
    .btn-logout { background:#4a2a2a; color:#e87e7e; border:1px solid #6a3a3a; }
    .btn-logout:hover { background:#5a3a3a; }
  </style>
</head>
<body>
  <img src="/logo.png" alt="Cartyx" class="logo">
  <div class="card">
    <h1>⚔️ Welcome, Adventurer</h1>
    <p class="subtitle">You have entered the realm</p>
    ${user.avatar
      ? `<img src="${user.avatar}" alt="avatar" class="avatar">`
      : `<div class="no-avatar">🧙</div>`}
    <div class="info">
      <div><span class="label">Name: </span><span class="value">${escapeHtml(user.name)}</span></div>
      <div><span class="label">Email: </span><span class="value">${escapeHtml(user.email || "Not provided")}</span></div>
      <div><span class="label">Provider: </span><span class="badge ${user.provider}">${user.provider}</span></div>
      <div><span class="label">User ID: </span><span class="value" style="font-size:.8em;opacity:.7">${escapeHtml(user.id)}</span></div>
    </div>
    <div class="session-info">
      🕐 Session expires: <strong>${expiresAt}</strong><br>
      ${expiresIn !== null ? `⏳ Time remaining: <strong>${expiresIn} minutes</strong>` : ""}
    </div>
    <div class="actions">

      <a href="/logout" class="btn btn-logout">🚪 Sign Out</a>
    </div>
  </div>
</body>
</html>`);
});

app.get("/api/me", isAuthenticated, async (req, res) => {
  const user = req.user;

  // Refresh role from DB on each call (in case it was updated)
  let role = user.role || "unknown";
  if (mongoose.connection.readyState) {
    const stored = await User.findOne({
      $or: [
        { providerId: user.id },
        ...(user.email ? [{ email: user.email }] : [])
      ]
    });
    if (stored) {
      role = stored.role;
      // Backfill providerId if missing
      if (!stored.providerId && user.id) {
        await User.updateOne({ _id: stored._id }, { providerId: user.id, lastLoginAt: new Date() });
      } else {
        await User.updateOne({ _id: stored._id }, { lastLoginAt: new Date() });
      }
    }
  }

  res.json({
    id:               user.id,
    provider:         user.provider,
    name:             user.name,
    email:            user.email,
    avatar:           user.avatar,
    role,
    sessionExpiresAt: req.session.sessionExpiresAt || null,
  });
});

// ---------------------------------------------------------------------------
// Static & Home
// ---------------------------------------------------------------------------

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`\n🏰 New World Auth Server running at ${BASE_URL}\n`);
  console.log("Configured providers:");
  console.log(`  Google: ${providerConfigured("google") ? "✅" : "❌ (add credentials to .env)"}`);
  console.log(`  GitHub: ${providerConfigured("github") ? "✅" : "❌ (add credentials to .env)"}`);
  console.log(`  Apple:  ${providerConfigured("apple") ? "✅" : "❌ (add credentials to .env)"}`);
  console.log("");
});
