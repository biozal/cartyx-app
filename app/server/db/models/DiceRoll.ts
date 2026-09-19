import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { now, objectId } from './schema-parts';

const attackRollSchema = z.object({
  roll: z.number(),
  type: z.enum(['hit', 'crit', 'miss', 'crit-fail']),
  total: z.number(),
  formula: z.string().default(''),
  discarded: z.boolean().default(false),
  dice: z.array(z.number()).default([]),
});

const damageRollSchema = z.object({
  damageType: z.string(),
  dice: z.array(z.number()),
  total: z.number(),
  flags: z.number().default(1),
  formula: z.string().default(''),
});

export const diceRollSchema = z.object({
  _id: objectId,
  id: z.string(),
  seq: z.number(),
  sessionId: objectId,
  campaignId: objectId,
  channel: z.enum(['general', 'gm']),
  character: z.string(),
  title: z.string(),
  rollType: z.string(),
  attackRolls: z.array(attackRollSchema).default([]),
  damageRolls: z.array(damageRollSchema).default([]),
  totalDamages: z.record(z.string(), z.unknown()).default({}),
  rollInfo: z.array(z.array(z.string())).default([]),
  description: z.string().default(''),
  timestamp: z.number(),
  createdAt: now(),
});

export type IDiceRoll = z.infer<typeof diceRollSchema>;

export const DiceRoll = defineGraphModel<IDiceRoll>({
  name: 'dicerolls',
  kind: 'DiceRoll',
  modelName: 'DiceRoll',
  schema: diceRollSchema,
  index: { sessionId: 'ix_s1', campaignId: 'ix_s2', channel: 'ix_s3', seq: 'ix_n1' },
  unique: { id: (roll) => [roll.id] },
});
