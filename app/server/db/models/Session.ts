import mongoose from 'mongoose'

const sessionSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
  number: { type: Number, required: true },
  name: { type: String, required: true },
  summary: { type: String },
  date: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

// istanbul ignore next
if (typeof (sessionSchema as { index?: unknown }).index === 'function') {
  sessionSchema.index({ campaignId: 1, number: -1 })
  sessionSchema.index({ campaignId: 1, date: -1 })
}

export const Session =
  mongoose.models.Session || mongoose.model('Session', sessionSchema)
