import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import {
  cropSchema,
  now,
  objectId,
  relationshipSchema,
  statusSchema,
  touch,
  touchUpdate,
} from './schema-parts';

export const playerSchema = z.object({
  _id: objectId,
  firstName: z.string(),
  lastName: z.string(),
  race: z.string(),
  characterClass: z.string(),
  age: z.number(),
  gender: z.string().default(''),
  location: z.string().default(''),
  link: z.string().default(''),
  picture: z.string().default(''),
  pictureCrop: cropSchema.nullable().default(null),
  description: z.string().default(''),
  backstory: z.string().default(''),
  gmNotes: z.string().default(''),
  color: z.string().default('#3498db'),
  eyeColor: z.string().default(''),
  hairColor: z.string().default(''),
  weight: z.number().nullable().default(null),
  height: z.string().default(''),
  size: z.string().default(''),
  appearance: z.string().default(''),
  status: statusSchema.default(() => ({
    value: 'alive' as const,
    changedAt: null,
    changedBy: null,
  })),
  relationships: z.array(relationshipSchema).default([]),
  campaignId: objectId,
  createdBy: objectId,
  createdAt: now(),
  updatedAt: now(),
});

export type IPlayer = z.infer<typeof playerSchema>;

export const Player = defineGraphModel<IPlayer>({
  name: 'players',
  kind: 'Player',
  modelName: 'Player',
  schema: playerSchema,
  index: { campaignId: 'ix_s1', createdBy: 'ix_s2', updatedAt: 'ix_d1' },
  searchText: (player) =>
    [player.firstName, player.lastName, player.race, player.location].join(' '),
  preSave: touch,
  preFindOneAndUpdate: (update) => touchUpdate(update),
});
