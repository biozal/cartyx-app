import mongoose from 'mongoose';

const diceRollSchema = new mongoose.Schema({
  id: { type: String, required: true },
  seq: { type: Number, required: true },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
  },
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true,
  },
  channel: {
    type: String,
    enum: ['general', 'gm'],
    required: true,
  },
  character: { type: String, required: true },
  title: { type: String, required: true },
  rollType: { type: String, required: true },
  attackRolls: [
    {
      roll: { type: Number, required: true },
      type: {
        type: String,
        enum: ['hit', 'crit', 'miss', 'crit-fail'],
        required: true,
      },
      total: { type: Number, required: true },
    },
  ],
  damageRolls: [
    {
      damageType: { type: String, required: true },
      dice: { type: [Number], required: true },
      total: { type: Number, required: true },
      flags: { type: Number, default: 1 },
    },
  ],
  totalDamages: { type: mongoose.Schema.Types.Mixed, default: {} },
  rollInfo: { type: [[String]], default: [] },
  description: { type: String, default: '' },
  timestamp: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

// istanbul ignore next
if (typeof (diceRollSchema as { index?: unknown }).index === 'function') {
  diceRollSchema.index({ sessionId: 1, seq: 1 });
  diceRollSchema.index({ id: 1 }, { unique: true });
}

export const DiceRoll = mongoose.models.DiceRoll || mongoose.model('DiceRoll', diceRollSchema);
