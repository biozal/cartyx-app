import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { now, objectId } from './schema-parts';

// Spell area-of-effect template on a map. Any member can create an AoE;
// deletion is gated to the author (createdBy) or any GM.
export const mapAoESchema = z.object({
  _id: objectId,
  mapId: objectId,
  // Denormalised for cheap auth checks (avoids a Map lookup per write).
  campaignId: objectId,
  shape: z.string(),
  // Origin in map-local pixels: center for sphere/cube/cylinder, apex for cone/line.
  originX: z.number(),
  originY: z.number(),
  // Radius / length / edge, in map-local pixels.
  sizePx: z.number(),
  // Line width / cylinder height, in map-local pixels (optional).
  widthPx: z.number().nullish(),
  // Aim in radians (cone/line); 0 for radial shapes.
  rotation: z.number(),
  color: z.string(),
  label: z.string().nullish(),
  // The author: a player may delete only their own AoE; a GM may delete anyone's.
  createdBy: objectId,
  // Placer's display name, denormalised so viewers need no user lookup.
  createdByName: z.string().default(''),
  createdAt: now(),
  updatedAt: now(),
});

export type IMapAoE = z.infer<typeof mapAoESchema>;

export const MapAoE = defineGraphModel<IMapAoE>({
  name: 'mapAoE',
  kind: 'MapAoE',
  modelName: 'MapAoE',
  schema: mapAoESchema,
  index: { mapId: 'ix_s1', campaignId: 'ix_s2' },
});
