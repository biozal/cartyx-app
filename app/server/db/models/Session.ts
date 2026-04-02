import mongoose from 'mongoose'

const sessionSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
  name: { type: String, required: true },
  gm: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  number: { type: Number, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  isActive: { type: Boolean, default: false },
  summary: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

// istanbul ignore next
if (typeof (sessionSchema as { index?: unknown }).index === 'function') {
  sessionSchema.index({ campaignId: 1, number: -1 })
  sessionSchema.index({ campaignId: 1, startDate: -1 })
  sessionSchema.index(
    { campaignId: 1, isActive: 1 },
    {
      unique: true,
      partialFilterExpression: { isActive: true },
    }
  )
}

export const Session =
  mongoose.models.Session || mongoose.model('Session', sessionSchema)
