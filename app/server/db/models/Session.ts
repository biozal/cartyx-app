import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import type { Doc } from '~/server/repositories/graph-model';
import { now, objectId } from './schema-parts';

export const sessionSchema = z.object({
  _id: objectId,
  campaignId: objectId,
  name: z.string(),
  gm: objectId,
  number: z.number(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullish(),
  status: z.enum(['not_started', 'active', 'completed']).default('not_started'),
  summary: z.string().nullish(),
  createdAt: now(),
  updatedAt: now(),
});

export type ISession = z.infer<typeof sessionSchema>;
export type SessionDoc = Doc<ISession>;

export const Session = defineGraphModel<ISession>({
  name: 'sessions',
  kind: 'Session',
  modelName: 'Session',
  schema: sessionSchema,
  index: {
    campaignId: 'ix_s1',
    status: 'ix_s2',
    gm: 'ix_s3',
    number: 'ix_n1',
    startDate: 'ix_d1',
  },
  // MongoDB's partial unique index: at most one active session per campaign.
  unique: {
    campaignId_number: (session) => [session.campaignId, session.number],
    activeSession: (session) => (session.status === 'active' ? [session.campaignId] : null),
  },
});
