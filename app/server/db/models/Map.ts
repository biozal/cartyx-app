import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { now, objectId, tags } from './schema-parts';

const scaleSchema = z.object({
  gridType: z.enum(['square', 'hex', 'gridless']).default('square'),
  pixelsPerSquare: z.number().default(50),
  feetPerSquare: z.number().default(5),
});

const gridOverlaySchema = z.object({
  enabled: z.boolean().default(false),
  color: z.string().default('#ffffff66'),
});

export const mapSchema = z.object({
  _id: objectId,
  campaignId: objectId,
  createdBy: objectId,
  name: z.string(),
  tags: tags(),
  imageKey: z.string(),
  imageUrl: z.string(),
  imageWidth: z.number(),
  imageHeight: z.number(),
  locationId: objectId.nullable().default(null),
  scale: scaleSchema.prefault({}),
  gridOverlay: gridOverlaySchema.prefault({}),
  createdAt: now(),
  updatedAt: now(),
});

export type IMap = z.infer<typeof mapSchema>;

export const Map = defineGraphModel<IMap>({
  name: 'map',
  kind: 'Map',
  modelName: 'Map',
  schema: mapSchema,
  index: { campaignId: 'ix_s1', locationId: 'ix_s2', name: 'ix_s3', updatedAt: 'ix_d1' },
  unique: { campaignId_name: (map) => [map.campaignId, map.name] },
});
