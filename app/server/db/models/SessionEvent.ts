import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { SESSION_EVENT_TYPES } from '~/types/tabletop';
import { now, objectId } from './schema-parts';

export const sessionEventSchema = z.object({
  _id: objectId,
  campaignId: objectId,
  sessionId: objectId,
  timestamp: now(),
  eventType: z.enum(SESSION_EVENT_TYPES),
  documentId: objectId,
  collection: z.string(),
  tabletopScreenId: objectId,
  triggeredBy: objectId,
  displayName: z.string(),
});

export type ISessionEvent = z.infer<typeof sessionEventSchema>;

export const SessionEvent = defineGraphModel<ISessionEvent>({
  name: 'sessionevent',
  kind: 'SessionEvent',
  modelName: 'SessionEvent',
  schema: sessionEventSchema,
  index: {
    campaignId: 'ix_s1',
    sessionId: 'ix_s2',
    documentId: 'ix_s3',
    tabletopScreenId: 'ix_s4',
    timestamp: 'ix_d1',
  },
});
