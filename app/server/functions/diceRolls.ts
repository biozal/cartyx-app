import { createServerFn } from '@tanstack/react-start';
import { getSession } from '../session';
import { connectDB, isDBConnected } from '../db/connection';
import { DiceRoll } from '../db/models/DiceRoll';
import { serverCaptureException } from '../utils/posthog';
import { listDiceRollsSchema, saveDiceRollSchema } from '~/types/schemas/diceRolls';

export const listDiceRolls = createServerFn({ method: 'GET' })
  .inputValidator(listDiceRollsSchema)
  .handler(async ({ data }) => {
    try {
      const user = await getSession();
      if (!user) throw new Error('Not authenticated');

      await connectDB();
      if (!isDBConnected()) throw new Error('Database not available');

      const filter: Record<string, unknown> = { sessionId: data.sessionId };
      if (data.beforeSeq !== undefined) {
        filter.seq = { $lt: data.beforeSeq };
      }

      const limit = data.limit ?? 100;

      const rolls = await DiceRoll.find(filter).sort({ seq: 1 }).limit(limit).lean();

      return (
        rolls as Array<{
          _id: unknown;
          id: string;
          seq: number;
          sessionId: unknown;
          campaignId: unknown;
          channel: string;
          character: string;
          title: string;
          rollType: string;
          attackRolls: Array<{ roll: number; type: string; total: number }>;
          damageRolls: Array<{ damageType: string; dice: number[]; total: number; flags: number }>;
          totalDamages: Record<string, number>;
          rollInfo: Array<[string, string]>;
          description: string;
          timestamp: number;
        }>
      ).map((r) => ({
        id: r.id,
        seq: r.seq,
        sessionId: String(r.sessionId),
        campaignId: String(r.campaignId),
        channel: r.channel as 'general' | 'gm',
        character: r.character,
        title: r.title,
        rollType: r.rollType,
        attackRolls: r.attackRolls,
        damageRolls: r.damageRolls,
        totalDamages: r.totalDamages,
        rollInfo: r.rollInfo,
        description: r.description,
        timestamp: r.timestamp,
      }));
    } catch (e) {
      serverCaptureException(e, undefined, {
        action: 'listDiceRolls',
        sessionId: data.sessionId,
      });
      throw e;
    }
  });

export const saveDiceRoll = createServerFn({ method: 'POST' })
  .inputValidator(saveDiceRollSchema)
  .handler(async ({ data }) => {
    try {
      const user = await getSession();
      if (!user) throw new Error('Not authenticated');

      await connectDB();
      if (!isDBConnected()) throw new Error('Database not available');

      await DiceRoll.updateOne(
        { id: data.id },
        {
          $set: { ...data },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );

      return { success: true };
    } catch (e) {
      serverCaptureException(e, undefined, {
        action: 'saveDiceRoll',
        messageId: data.id,
        sessionId: data.sessionId,
      });
      throw e;
    }
  });
