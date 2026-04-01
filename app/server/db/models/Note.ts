import mongoose from 'mongoose'
import { normalizeTags } from '~/server/utils/helpers'

const noteSchema = new mongoose.Schema({
  title: { type: String, required: true },
  tags: { type: [String], default: [] },
  note: { type: String, default: '' },
  isPublic: { type: Boolean, default: false },
  isReadOnly: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
})

// Normalize tags and refresh updatedAt before every save
noteSchema.pre('save', function () {
  if (this.isModified('tags')) {
    this.tags = normalizeTags(this.tags)
  }
  this.updatedAt = new Date()
})

noteSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate() as Record<string, unknown> | null
  if (!update) return

  // Aggregation pipeline updates are arrays — skip field-level patching
  if (Array.isArray(update)) return

  if ('$set' in update) {
    const set = update.$set as Record<string, unknown>
    if (Array.isArray(set.tags)) {
      set.tags = normalizeTags(set.tags as string[])
    }
    set.updatedAt = new Date()
  } else {
    if (Array.isArray((update as Record<string, unknown>).tags)) {
      ;(update as Record<string, string[]>).tags = normalizeTags(
        (update as Record<string, string[]>).tags,
      )
    }
    ;(update as Record<string, unknown>).updatedAt = new Date()
  }
})

// istanbul ignore next
if (typeof (noteSchema as { index?: unknown }).index === 'function') {
  noteSchema.index({ sessionId: 1 })
  noteSchema.index({ campaignId: 1 })
  noteSchema.index({ createdBy: 1 })
  noteSchema.index({ tags: 1 })
  noteSchema.index({ isPublic: 1 })
  noteSchema.index({ title: 'text', note: 'text' })
}

export const Note = mongoose.models.Note || mongoose.model('Note', noteSchema)
