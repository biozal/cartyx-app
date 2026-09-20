import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { imageSchema, now, objectId, tags, touchAndNormalizeTags } from './schema-parts';

const giverSchema = z.object({
  kind: z.enum(['character', 'player', 'organization']),
  id: objectId,
});

const questLinkSchema = z.object({
  kind: z.enum(['character', 'player', 'location', 'organization']),
  id: objectId,
  role: z.string().default(''),
  publicInfo: z.string().default(''),
  privateInfo: z.string().default(''),
});

const questEventLinkSchema = z.object({
  eventId: objectId,
  role: z.string().default(''),
  publicInfo: z.string().default(''),
  privateInfo: z.string().default(''),
});

export const questSchema = z.object({
  _id: objectId,
  name: z.string(),
  type: z.string().default(''),
  status: z
    .enum(['not_started', 'active', 'on_hold', 'completed', 'failed'])
    .default('not_started'),
  publicInfo: z.string().default(''),
  privateInfo: z.string().default(''),
  isPublic: z.boolean().default(false),
  giver: giverSchema.nullable().default(null),
  parentQuestId: objectId.nullable().default(null),
  links: z.array(questLinkSchema).default([]),
  events: z.array(questEventLinkSchema).default([]),
  images: z.array(imageSchema).default([]),
  tags: tags(),
  campaignId: objectId,
  createdBy: objectId,
  createdAt: now(),
  updatedAt: now(),
});

export type IQuest = z.infer<typeof questSchema>;

export const Quest = defineGraphModel<IQuest>({
  name: 'quests',
  kind: 'Quest',
  modelName: 'Quest',
  schema: questSchema,
  index: {
    campaignId: 'ix_s1',
    createdBy: 'ix_s2',
    status: 'ix_s3',
    parentQuestId: 'ix_s4',
    isPublic: 'ix_b1',
    updatedAt: 'ix_d1',
  },
  searchText: (quest) => `${quest.name} ${quest.publicInfo}`,
  preSave: touchAndNormalizeTags,
});
