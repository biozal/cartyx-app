import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { imageSchema, now, objectId, tags, touchAndNormalizeTags } from './schema-parts';

const linkSchema = z.object({
  kind: z.enum(['race', 'character', 'player', 'location']),
  id: objectId,
});

export const loreSchema = z.object({
  _id: objectId,
  title: z.string(),
  content: z.string().default(''),
  gmContent: z.string().default(''),
  isPublic: z.boolean().default(false),
  images: z.array(imageSchema).default([]),
  links: z.array(linkSchema).default([]),
  tags: tags(),
  campaignId: objectId,
  createdBy: objectId,
  createdAt: now(),
  updatedAt: now(),
});

export type ILore = z.infer<typeof loreSchema>;

export const Lore = defineGraphModel<ILore>({
  name: 'lores',
  kind: 'Lore',
  modelName: 'Lore',
  schema: loreSchema,
  index: { campaignId: 'ix_s1', createdBy: 'ix_s2', isPublic: 'ix_b1', updatedAt: 'ix_d1' },
  searchText: (lore) => `${lore.title} ${lore.content}`,
  preSave: touchAndNormalizeTags,
});
