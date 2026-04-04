import mongoose from 'mongoose'

const tagSchema = new mongoose.Schema({
  name: { type: String, required: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

tagSchema.index({ campaignId: 1, name: 1 }, { unique: true })
tagSchema.index({ campaignId: 1 })

export const Tag = mongoose.models.Tag || mongoose.model('Tag', tagSchema)
