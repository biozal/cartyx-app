import { z } from 'zod';
import { objectIdString } from '~/server/repositories/collection';
import { defineGraphModel } from '~/server/repositories/graph-model';

export const tagSchema = z.object({
  _id: objectIdString,
  name: z.string(),
  campaignId: objectIdString,
  createdBy: objectIdString,
  createdAt: z.coerce.date().default(() => new Date()),
  updatedAt: z.coerce.date().default(() => new Date()),
});

export type ITag = z.infer<typeof tagSchema>;

export const Tag = defineGraphModel<ITag>({
  name: 'tags',
  kind: 'Tag',
  modelName: 'Tag',
  schema: tagSchema,
  index: { campaignId: 'ix_s1', name: 'ix_s2' },
  unique: { campaignId_name: (tag) => [tag.campaignId, tag.name] },
});
