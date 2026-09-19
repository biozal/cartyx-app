import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { DEFAULT_FADE_SECONDS, DEFAULT_VOLUME } from '~/types/soundboard';
import { now, objectId, touch } from './schema-parts';

const packageItemSchema = z.object({
  id: z.string(),
  assetId: objectId,
  label: z.string().nullable().default(null),
  volume: z.number().default(DEFAULT_VOLUME),
  fadeSeconds: z.number().default(DEFAULT_FADE_SECONDS),
  loop: z.boolean().default(false),
  randomIntervalMin: z.number().nullable().default(null),
  randomIntervalMax: z.number().nullable().default(null),
  volumeJitter: z.number().nullable().default(null),
  panJitter: z.number().nullable().default(null),
  sortIndex: z.number().default(0),
});

const moodStateSchema = z.object({
  itemId: z.string(),
  playing: z.boolean().default(false),
  volume: z.number().nullable().default(null),
  fadeSeconds: z.number().nullable().default(null),
  randomIntervalMin: z.number().nullable().default(null),
  randomIntervalMax: z.number().nullable().default(null),
});

const moodSchema = z.object({
  id: z.string(),
  name: z.string(),
  states: z.array(moodStateSchema).default([]),
});

export const audioPackageSchema = z.object({
  _id: objectId,
  // Null for system packages, which every GM can use.
  ownerId: objectId.nullable().default(null),
  name: z.string(),
  description: z.string().nullable().default(null),
  items: z.array(packageItemSchema).default([]),
  moods: z.array(moodSchema).default([]),
  createdAt: now(),
  updatedAt: now(),
});

export type IAudioPackage = z.infer<typeof audioPackageSchema>;

export const AudioPackage = defineGraphModel<IAudioPackage>({
  name: 'audiopackages',
  kind: 'AudioPackage',
  modelName: 'AudioPackage',
  schema: audioPackageSchema,
  index: { ownerId: 'ix_s1', name: 'ix_s2' },
  preSave: touch,
});
