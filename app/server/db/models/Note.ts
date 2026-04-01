import mongoose from 'mongoose'
import { normalizeTags } from '~/server/utils/helpers'

const noteSchema = new mongoose.Schema({
  title: { type: String, required: true },
  tags: { type: [String], default: [] },
  note: { type: String, required: true },
  isPublic: { type: Boolean, default: false },
  isReadOnly: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
})

noteSchema.pre('save', function () {
  if (this.isModified('tags')) {
    this.tags = normalizeTags(this.tags)
  }
  this.updatedAt = new Date()
})

noteSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate() as unknown
  if (!update) return

  if (Array.isArray(update)) {
    update.forEach((stage) => {
      if (!stage || typeof stage !== 'object') return
      const stageObj = stage as Record<string, any>
      const set = (stageObj.$set ??= {})
      if (Array.isArray(set.tags)) {
        set.tags = normalizeTags(set.tags as string[])
      }
      set.updatedAt = new Date()
    })
    this.setUpdate(update)
    return
  }

  const updateObj = update as Record<string, any>
  if ('$set' in updateObj) {
    const set = (updateObj.$set ??= {})
    if (Array.isArray(set.tags)) {
      set.tags = normalizeTags(set.tags as string[])
    }
    set.updatedAt = new Date()
  } else {
    if (Array.isArray(updateObj.tags)) {
      updateObj.tags = normalizeTags(updateObj.tags as string[])
    }
    updateObj.updatedAt = new Date()
  }
})

// istanbul ignore next
if (typeof (noteSchema as { index?: unknown }).index === 'function') {
  noteSchema.index({ sessionId: 1 })
  noteSchema.index({ campaignId: 1 })
  noteSchema.index({ campaignId: 1, updatedAt: -1 })
  noteSchema.index({ createdBy: 1 })
  noteSchema.index({ tags: 1 })
  noteSchema.index({ isPublic: 1 })
  noteSchema.index({ title: 'text', note: 'text' })
}

export const Note = mongoose.models.Note || mongoose.model('Note', noteSchema)
