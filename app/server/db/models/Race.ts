import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { now, objectId, tags, touchAndNormalizeTags, touchUpdate } from './schema-parts';

export const raceSchema = z.object({
  _id: objectId,
  title: z.string(),
  content: z.string(),
  tags: tags(),

  campaignId: objectId,
  createdBy: objectId,
  createdAt: now(),
  updatedAt: now(),
});

export type IRace = z.infer<typeof raceSchema>;

export const Race = defineGraphModel<IRace>({
  name: 'races',
  kind: 'Race',
  modelName: 'Race',
  schema: raceSchema,
  index: { campaignId: 'ix_s1', createdBy: 'ix_s2', updatedAt: 'ix_d1' },
  searchText: (race) => `${race.title} ${race.content}`,
  preSave: touchAndNormalizeTags,
  preFindOneAndUpdate: (update) => touchUpdate(update, { tags: true }),
});
