import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { now, objectId, tags, touchAndNormalizeTags, touchUpdate } from './schema-parts';

export const ruleSchema = z.object({
  _id: objectId,
  title: z.string(),
  content: z.string(),
  tags: tags(),
  isPublic: z.boolean().default(false),
  campaignId: objectId,
  createdBy: objectId,
  createdAt: now(),
  updatedAt: now(),
});

export type IRule = z.infer<typeof ruleSchema>;

export const Rule = defineGraphModel<IRule>({
  name: 'rules',
  kind: 'Rule',
  modelName: 'Rule',
  schema: ruleSchema,
  index: { campaignId: 'ix_s1', createdBy: 'ix_s2', isPublic: 'ix_b1', updatedAt: 'ix_d1' },
  searchText: (rule) => `${rule.title} ${rule.content}`,
  preSave: touchAndNormalizeTags,
  preFindOneAndUpdate: (update) => touchUpdate(update, { tags: true }),
});
