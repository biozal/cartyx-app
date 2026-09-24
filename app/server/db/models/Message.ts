import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { now, objectId } from './schema-parts';

export const messageSchema = z.object({
  _id: objectId,
  id: z.string(),
  seq: z.number(),
  sessionId: objectId,
  campaignId: objectId,
  channel: z.enum(['general', 'gm']),
  type: z.enum(['chat', 'spell-card', 'trait', 'item']),
  authorId: z.string(),
  authorName: z.string(),
  text: z.string().default(''),
  // A nested path in Mongoose: present unless explicitly null (plain chat is seeded so).
  beyond20Data: z
    .object({
      title: z.string().nullish(),
      source: z.string().nullish(),
      description: z.string().nullish(),
      properties: z.record(z.string(), z.unknown()).default({}),
    })
    .nullable()
    .prefault({}),
  timestamp: z.number(),
  createdAt: now(),
});

export type IMessage = z.infer<typeof messageSchema>;

export const Message = defineGraphModel<IMessage>({
  name: 'messages',
  kind: 'Message',
  modelName: 'Message',
  schema: messageSchema,
  index: { sessionId: 'ix_s1', campaignId: 'ix_s2', channel: 'ix_s3', seq: 'ix_n1' },
  unique: { id: (message) => [message.id] },
});
