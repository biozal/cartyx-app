import mongoose from 'mongoose'

const gmScreenSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
    name: { type: String, required: true },
    widgets: { type: [mongoose.Schema.Types.Mixed], default: [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'gmscreen' },
)

// istanbul ignore next
if (typeof (gmScreenSchema as { index?: unknown }).index === 'function') {
  gmScreenSchema.index({ campaignId: 1 })
}

export const GMScreen =
  mongoose.models.GMScreen || mongoose.model('GMScreen', gmScreenSchema)
