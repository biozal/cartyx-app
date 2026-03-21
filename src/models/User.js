'use strict';

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email:      { type: String, unique: true, sparse: true },
  role:       { type: String, enum: ['gm', 'player', 'unknown'], default: 'unknown', index: true },
  provider:   String,
  providerId: { type: String, unique: true, sparse: true },
  firstName:  String,
  lastName:   String,
  avatarUrl:  String,
  campaigns:  [{ campaignId: mongoose.Schema.Types.ObjectId, joinedAt: Date, status: String }],
  lastLoginAt: { type: Date, default: Date.now },
  createdAt:  { type: Date, default: Date.now },
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
