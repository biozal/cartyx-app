import { z } from 'zod';
import { objectIdString } from '~/server/repositories/collection';
import { defineGraphModel } from '~/server/repositories/graph-model';

/** Mirrors the Mongoose schema it replaced: same fields, defaults and stripping. */
export const locationSchema = z.object({
  _id: objectIdString,
  campaignId: objectIdString,
  createdBy: objectIdString,
  name: z.string(),
  locationType: z.string(),
  description: z.string().default(''),
  gmNotes: z.string().default(''),
  isPublic: z.boolean().default(true),
  parentLocations: z.array(objectIdString).default([]),
  childLocations: z.array(objectIdString).default([]),
  mapImage: z.string().nullable().default(null),
  mapBounds: z
    .object({ north: z.number(), south: z.number(), east: z.number(), west: z.number() })
    .nullable()
    .default(null),
  images: z
    .array(
      z.object({
        imageKey: z.string(),
        url: z.string(),
        title: z.string(),
        uploadedAt: z.coerce.date().default(() => new Date()),
      })
    )
    .default([]),
  tags: z.array(z.string()).default([]),
  createdAt: z.coerce.date().default(() => new Date()),
  updatedAt: z.coerce.date().default(() => new Date()),
});

export type ILocation = z.infer<typeof locationSchema>;

export const Location = defineGraphModel<ILocation>({
  name: 'location',
  kind: 'Location',
  modelName: 'Location',
  schema: locationSchema,
  index: {
    campaignId: 'ix_s1',
    locationType: 'ix_s2',
    isPublic: 'ix_b1',
    updatedAt: 'ix_d1',
  },
  searchText: (location) => `${location.name} ${location.description}`,
});
