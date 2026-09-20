import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import {
  cropSchema,
  now,
  objectId,
  relationshipSchema,
  statusSchema,
  tags,
  touchAndNormalizeTags,
  touchUpdate,
} from './schema-parts';

export const characterSchema = z.object({
  _id: objectId,
  firstName: z.string(),
  lastName: z.string(),
  race: z.string().default(''),
  characterClass: z.string().default(''),
  age: z.number().nullable().default(null),
  location: z.string().default(''),
  link: z.string().default(''),
  picture: z.string().default(''),
  pictureCrop: cropSchema.nullable().default(null),
  notes: z.string().default(''),
  gmNotes: z.string().default(''),
  tags: tags(),
  isPublic: z.boolean().default(false),
  sessionId: objectId.nullish(),
  sessions: z.array(objectId).default([]),
  campaignId: objectId,
  createdBy: objectId,
  createdAt: now(),
  updatedAt: now(),
  status: statusSchema.default(() => ({
    value: 'alive' as const,
    changedAt: null,
    changedBy: null,
  })),
  relationships: z.array(relationshipSchema).default([]),
});

export type ICharacter = z.infer<typeof characterSchema>;

export const Character = defineGraphModel<ICharacter>({
  name: 'characters',
  kind: 'Character',
  modelName: 'Character',
  schema: characterSchema,
  index: {
    campaignId: 'ix_s1',
    createdBy: 'ix_s2',
    sessionId: 'ix_s3',
    isPublic: 'ix_b1',
    updatedAt: 'ix_d1',
  },
  searchText: (character) =>
    [
      character.firstName,
      character.lastName,
      character.race,
      character.location,
      character.notes,
    ].join(' '),
  preSave: touchAndNormalizeTags,
  preFindOneAndUpdate: (update) => touchUpdate(update, { tags: true }),
});
