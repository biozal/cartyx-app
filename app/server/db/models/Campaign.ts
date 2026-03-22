import mongoose from 'mongoose'

const campaignSchema = new mongoose.Schema({
  gameMasterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  description: String,
  imagePath: String,
  schedule: { frequency: String, dayOfWeek: String, time: String, timezone: String },
  callUrl: String,
  dndBeyondUrl: String,
  maxPlayers: { type: Number, default: 4 },
  inviteCode: { type: String, unique: true, sparse: true },
  status: { type: String, default: 'active' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

export const Campaign =
  mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema)
