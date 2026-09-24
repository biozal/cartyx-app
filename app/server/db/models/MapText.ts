import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { now, objectId } from './schema-parts';

// Freeform text written on a map by a player or GM. Deletion is gated to the
// author (createdBy) or any GM.
export const mapTextSchema = z.object({
  _id: objectId,
  mapId: objectId,
  // Denormalised for cheap auth checks (avoids a Map lookup per write).
  campaignId: objectId,
  // Position in MAP-LOCAL pixel coordinates (the image's native pixel space).
  x: z.number(),
  y: z.number(),
  text: z.string(),
  color: z.string().default('#fbbf24'),
  // Font size in map-local pixels (rendered scaled by the viewport).
  fontSize: z.number().default(16),
  createdBy: objectId,
  createdAt: now(),
  updatedAt: now(),
});

export type IMapText = z.infer<typeof mapTextSchema>;

export const MapText = defineGraphModel<IMapText>({
  name: 'mapText',
  kind: 'MapText',
  modelName: 'MapText',
  schema: mapTextSchema,
  index: { mapId: 'ix_s1', campaignId: 'ix_s2' },
});
