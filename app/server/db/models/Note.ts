import mongoose from 'mongoose'

const noteSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  note: { type: String, required: true },
  tags: { type: [String], default: [] },
  isPublic: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

// istanbul ignore next
if (typeof (noteSchema as { index?: unknown }).index === 'function') {
  noteSchema.index({ campaignId: 1, createdAt: -1 })
  noteSchema.index({ campaignId: 1, sessionId: 1 })
  noteSchema.index({ campaignId: 1, title: 'text', note: 'text' })
}

export const Note =
  mongoose.models.Note || mongoose.model('Note', noteSchema)
