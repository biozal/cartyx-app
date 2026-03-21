'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const Campaign = require('../models/Campaign');
const { generateInviteCode } = require('../utils/helpers');

exports.listCampaigns = async (req, res) => {
  const user = req.user;
  const isGm = user.role === 'gm';
  let campaigns = [];

  if (mongoose.connection.readyState) {
    try {
      const dbUser = await User.findOne({ providerId: user.id });
      const rawCampaigns = dbUser
        ? await Campaign.find({ $or: [{ gameMasterId: dbUser._id }, { status: 'active' }] }).sort({ createdAt: -1 })
        : await Campaign.find({ status: 'active' }).sort({ createdAt: -1 });
      campaigns = rawCampaigns.map(c => ({
        id: String(c._id),
        name: c.name || 'Untitled Campaign',
        description: c.description || '',
        status: c.status || 'active',
        inviteCode: c.inviteCode || '',
        imagePath: c.imagePath || null,
        players: { current: 0, max: c.maxPlayers || 4 },
        nextSession: c.schedule && c.schedule.dayOfWeek
          ? { day: c.schedule.dayOfWeek, time: c.schedule.time || 'TBD' }
          : null,
      }));
    } catch (err) {
      console.error('Failed to fetch campaigns:', err.message);
    }
  }

  res.render('campaigns/list', { user, campaigns, isGm, hasCampaigns: campaigns.length > 0 });
};

exports.newCampaignForm = (req, res) => {
  const user = req.user;
  if (user.role !== 'gm') return res.redirect('/campaigns');
  res.render('campaigns/new', { user });
};

exports.editorForm = async (req, res) => {
  const user = req.user;
  const campaignId = req.query.id;
  let campaign = null;
  let errorMsg = null;

  if (campaignId) {
    if (!mongoose.connection.readyState) {
      errorMsg = 'Database not available.';
    } else {
      try {
        const dbUser = await User.findOne({ providerId: user.id });
        campaign = await Campaign.findById(campaignId);
        if (!campaign) {
          errorMsg = 'Campaign not found.';
          campaign = null;
        } else if (!dbUser || String(campaign.gameMasterId) !== String(dbUser._id)) {
          return res.status(403).send('Forbidden');
        }
      } catch (_e) {
        errorMsg = 'Invalid campaign ID.';
        campaign = null;
      }
    }
  }

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const timezones = [
    ['America/New_York', 'ET (New York)'],
    ['America/Chicago', 'CT (Chicago)'],
    ['America/Denver', 'MT (Denver)'],
    ['America/Los_Angeles', 'PT (Los Angeles)'],
    ['America/Anchorage', 'AKT (Anchorage)'],
    ['Pacific/Honolulu', 'HST (Honolulu)'],
    ['Europe/London', 'GMT (London)'],
    ['Europe/Paris', 'CET (Paris)'],
    ['Europe/Berlin', 'CET (Berlin)'],
    ['Asia/Tokyo', 'JST (Tokyo)'],
    ['Asia/Sydney', 'AEST (Sydney)'],
    ['UTC', 'UTC'],
  ];

  res.render('campaigns/editor', { user, campaign, errorMsg, days, timezones });
};

exports.createCampaign = async (req, res) => {
  if (req.user.role !== 'gm') {
    return res.status(403).json({ error: 'Only GMs can create campaigns.' });
  }
  if (!mongoose.connection.readyState) {
    return res.status(503).json({ error: 'Database not available.' });
  }

  const { name, description, schedFreq, schedDay, schedTime, schedTz, callUrl, dndBeyondUrl, maxPlayers } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Campaign name is required.' });
  }

  try {
    const dbUser = await User.findOne({ providerId: req.user.id });
    if (!dbUser) return res.status(400).json({ error: 'User not found.' });

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
      description: description ? description.trim() : '',
      imagePath,
      schedule: { frequency: schedFreq || null, dayOfWeek: schedDay || null, time: schedTime || null, timezone: schedTz || null },
      callUrl: callUrl || null,
      dndBeyondUrl: dndBeyondUrl || null,
      maxPlayers: parseMaxPlayers(maxPlayers),
      inviteCode,
    });

    res.json({ success: true, campaignId: String(campaign._id), inviteCode, redirectTo: `/campaigns/summary/${campaign._id}` });
  } catch (err) {
    console.error('POST /api/campaigns error:', err.message);
    res.status(500).json({ error: 'Failed to create campaign.' });
  }
};

function parseMaxPlayers(value) {
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 1) return 1;
  if (n > 10) return 10;
  return n;
}

exports.updateCampaign = async (req, res) => {
  if (!mongoose.connection.readyState) {
    return res.status(503).json({ error: 'Database not available.' });
  }
  try {
    const dbUser = await User.findOne({ providerId: req.user.id });
    if (!dbUser) return res.status(400).json({ error: 'User not found.' });

    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
    if (String(campaign.gameMasterId) !== String(dbUser._id)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const { name, description, schedFreq, schedDay, schedTime, schedTz, callUrl, dndBeyondUrl, maxPlayers } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Campaign name is required.' });

    campaign.name = name.trim();
    campaign.description = description ? description.trim() : '';
    campaign.schedule = { frequency: schedFreq || null, dayOfWeek: schedDay || null, time: schedTime || null, timezone: schedTz || null };
    campaign.callUrl = callUrl || null;
    campaign.dndBeyondUrl = dndBeyondUrl || null;
    campaign.maxPlayers = parseMaxPlayers(maxPlayers);
    campaign.updatedAt = new Date();
    if (req.file) campaign.imagePath = `/uploads/campaigns/${req.file.filename}`;

    await campaign.save();
    res.json({ redirectTo: `/campaigns/summary/${campaign._id}` });
  } catch (err) {
    console.error('PUT /api/campaigns/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update campaign.' });
  }
};

exports.summaryCampaign = async (req, res) => {
  const user = req.user;
  if (!mongoose.connection.readyState) {
    return res.status(503).send('Database not available.');
  }
  let campaign;
  try {
    campaign = await Campaign.findById(req.params.id);
  } catch (_e) {
    return res.status(404).send('Campaign not found.');
  }
  if (!campaign) return res.status(404).send('Campaign not found.');

  const dbUser = await User.findOne({ providerId: user.id });
  const isOwner = dbUser && String(campaign.gameMasterId) === String(dbUser._id);

  const freqLabel = campaign.schedule && campaign.schedule.frequency ? campaign.schedule.frequency : null;
  const dayLabel = campaign.schedule && campaign.schedule.dayOfWeek ? campaign.schedule.dayOfWeek : null;
  const timeLabel = campaign.schedule && campaign.schedule.time ? campaign.schedule.time : null;
  const tzLabel = campaign.schedule && campaign.schedule.timezone ? campaign.schedule.timezone : null;
  const scheduleText = [freqLabel, dayLabel, timeLabel, tzLabel].filter(Boolean).join(' · ') || 'Not scheduled';

  res.render('campaigns/summary', { user, campaign, isOwner, scheduleText });
};

exports.dashboard = (req, res) => {
  const user = req.user;
  const expiresAt = req.session.sessionExpiresAt
    ? new Date(req.session.sessionExpiresAt).toISOString()
    : 'unknown';
  const expiresIn = req.session.sessionExpiresAt
    ? Math.max(0, Math.round((req.session.sessionExpiresAt - Date.now()) / 1000 / 60))
    : null;
  res.render('dashboard', { user, expiresAt, expiresIn });
};

exports.apiMe = async (req, res) => {
  const user = req.user;
  let role = user.role || 'unknown';

  if (mongoose.connection.readyState) {
    const stored = await User.findOne({
      $or: [
        { providerId: user.id },
        ...(user.email ? [{ email: user.email }] : []),
      ],
    });
    if (stored) {
      role = stored.role;
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
};
