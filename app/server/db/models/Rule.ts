import mongoose from 'mongoose';
import { normalizeTags } from '~/server/utils/helpers';

const ruleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  tags: { type: [String], default: [] },
  isPublic: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
});

ruleSchema.pre('save', function () {
  if (this.isModified('tags')) {
    this.tags = normalizeTags(this.tags);
  }
  this.updatedAt = new Date();
});

ruleSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate() as unknown;
  if (!update) return;

  if (Array.isArray(update)) {
    let hasSetStage = false;
    update.forEach((stage) => {
      if (!stage || typeof stage !== 'object') return;
      const stageObj = stage as Record<string, any>;
      if (!('$set' in stageObj)) return;
      hasSetStage = true;
      const set = stageObj.$set as Record<string, any>;
      if (Array.isArray(set.tags)) {
        set.tags = normalizeTags(set.tags as string[]);
      }
      set.updatedAt = new Date();
    });
    if (!hasSetStage) {
      update.push({ $set: { updatedAt: new Date() } });
    }
    this.setUpdate(update);
    return;
  }

  const updateObj = update as Record<string, any>;
  if ('$set' in updateObj) {
    const set = (updateObj.$set ??= {});
    if (Array.isArray(set.tags)) {
      set.tags = normalizeTags(set.tags as string[]);
    }
    set.updatedAt = new Date();
  } else {
    if (Array.isArray(updateObj.tags)) {
      updateObj.tags = normalizeTags(updateObj.tags as string[]);
    }
    updateObj.updatedAt = new Date();
  }
});

if (typeof (ruleSchema as { index?: unknown }).index === 'function') {
  ruleSchema.index({ campaignId: 1 });
  ruleSchema.index({ campaignId: 1, updatedAt: -1 });
  ruleSchema.index({ createdBy: 1 });
  ruleSchema.index({ tags: 1 });
  ruleSchema.index({ isPublic: 1 });
  ruleSchema.index({ title: 'text', content: 'text' });
}

export const Rule = mongoose.models.Rule || mongoose.model('Rule', ruleSchema);
