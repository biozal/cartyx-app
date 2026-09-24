import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { now, objectId, tags, touchAndNormalizeTags } from './schema-parts';

const linkSchema = z.object({
  kind: z.enum(['character', 'player', 'race', 'location', 'lore']),
  id: objectId,
});
const cropSchema = z.object({
  x: z.number().nullish(),
  y: z.number().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
});
const imageSchema = z.object({
  url: z.string(),
  caption: z.string().default(''),
  crop: cropSchema.nullable().default(null),
});
const calDateSchema = z.object({
  year: z.number().nullish(),
  monthIndex: z.number().nullish(),
  day: z.number().nullish(),
});

export const eventSchema = z.object({
  _id: objectId,
  title: z.string(),
  content: z.string().default(''),
  gmContent: z.string().default(''),
  isPublic: z.boolean().default(false),
  isEpic: z.boolean().default(false),
  start: calDateSchema,
  end: calDateSchema.nullable().default(null),
  startOrdinal: z.number(),
  endOrdinal: z.number(),
  links: z.array(linkSchema).default([]),
  sessionId: objectId.nullable().default(null),
  images: z.array(imageSchema).default([]),
  tags: tags(),
  color: z.string().nullable().default(null),
  campaignId: objectId,
  calendarId: objectId,
  createdBy: objectId,
  createdAt: now(),
  updatedAt: now(),
});

export type IEvent = z.infer<typeof eventSchema>;

export const Event = defineGraphModel<IEvent>({
  name: 'events',
  kind: 'Event',
  modelName: 'Event',
  schema: eventSchema,
  index: {
    campaignId: 'ix_s1',
    calendarId: 'ix_s2',
    sessionId: 'ix_s3',
    isPublic: 'ix_b1',
    isEpic: 'ix_b2',
    startOrdinal: 'ix_n1',
    endOrdinal: 'ix_n2',
  },
  searchText: (event) => `${event.title} ${event.content}`,
  preSave: touchAndNormalizeTags,
});
