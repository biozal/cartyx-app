import mongoose from 'mongoose'

const playerSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  characterName: { type: String, required: true },
  characterClass: { type: String, required: true },
  avatar: { type: String },
  joinedAt: { type: Date, default: Date.now },
})

// istanbul ignore next
if (typeof (playerSchema as { index?: unknown }).index === 'function') {
  playerSchema.index({ campaignId: 1, userId: 1 }, { unique: true })
  playerSchema.index({ campaignId: 1 })
}

export const Player =
  mongoose.models.Player || mongoose.model('Player', playerSchema)
