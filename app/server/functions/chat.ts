import { createServerFn } from '@tanstack/react-start';
import { getSession } from '../session';
import { connectDB, isDBConnected } from '../db/connection';
import { User } from '../db/models/User';
import { Campaign } from '../db/models/Campaign';
import { Message } from '../db/models/Message';
import { serverCaptureException } from '../utils/posthog';
import { listMessagesSchema, saveMessageSchema } from '~/types/schemas/chat';

async function requireCampaignMember(campaignId: string) {
  const user = await getSession();
  if (!user) throw new Error('Not authenticated');

  await connectDB();
  if (!isDBConnected()) throw new Error('Database not available');

  const dbUser = await User.findOne({ providerId: user.id });
  if (!dbUser) throw new Error('User not found');

  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  return { user, dbUser, campaign };
}

export const listMessages = createServerFn({ method: 'GET' })
  .inputValidator(listMessagesSchema)
  .handler(async ({ data }) => {
    try {
      await requireCampaignMember(data.sessionId);

      const filter: Record<string, unknown> = { sessionId: data.sessionId };
      if (data.beforeSeq !== undefined) {
        filter.seq = { $lt: data.beforeSeq };
      }

      const limit = data.limit ?? 100;

      const messages = await Message.find(filter).sort({ seq: 1 }).limit(limit).lean();

      return (
        messages as Array<{
          _id: unknown;
          id: string;
          seq: number;
          sessionId: unknown;
          campaignId: unknown;
          channel: string;
          type: string;
          authorId: string;
          authorName: string;
          text: string;
          beyond20Data?: {
            title: string;
            source: string;
            description: string;
            properties: Record<string, string>;
          };
          timestamp: number;
        }>
      ).map((m) => ({
        id: m.id,
        seq: m.seq,
        sessionId: String(m.sessionId),
        campaignId: String(m.campaignId),
        channel: m.channel as 'general' | 'gm',
        type: m.type as 'chat' | 'spell-card' | 'trait' | 'item',
        authorId: m.authorId,
        authorName: m.authorName,
        text: m.text,
        beyond20Data: m.beyond20Data,
        timestamp: m.timestamp,
      }));
    } catch (e) {
      serverCaptureException(e, undefined, {
        action: 'listMessages',
        sessionId: data.sessionId,
      });
      throw e;
    }
  });

export const saveMessage = createServerFn({ method: 'POST' })
  .inputValidator(saveMessageSchema)
  .handler(async ({ data }) => {
    try {
      await connectDB();
      if (!isDBConnected()) throw new Error('Database not available');

      await Message.updateOne(
        { id: data.id },
        { $setOnInsert: { ...data, createdAt: new Date() } },
        { upsert: true }
      );

      return { success: true };
    } catch (e) {
      serverCaptureException(e, undefined, {
        action: 'saveMessage',
        messageId: data.id,
        sessionId: data.sessionId,
      });
      throw e;
    }
  });
