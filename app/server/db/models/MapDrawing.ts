import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { now, objectId } from './schema-parts';

// Freeform drawing placed on a map by a player or GM (pencil stroke, rectangle,
// or ellipse). Modification is gated to the author (createdBy) or any GM. All
// geometry is in MAP-LOCAL pixel coordinates, rendered scaled by the viewport.
export const mapDrawingSchema = z.object({
  _id: objectId,
  mapId: objectId,
  // Denormalised for cheap auth checks (avoids a Map lookup per write).
  campaignId: objectId,
  // 'pencil' → freeform polyline (points); 'rect'/'ellipse' → bounding box.
  kind: z.enum(['pencil', 'rect', 'ellipse']),
  color: z.string().default('#e74c3c'),
  strokeWidth: z.number().default(4),
  // Filled vs. outline (rect/ellipse only; ignored for pencil).
  filled: z.boolean().default(false),
  // Pencil: flattened [x0, y0, x1, y1, …] map-local points. Empty otherwise.
  points: z.array(z.number()).default([]),
  // Bounding box for rect/ellipse (map-local pixels). Zero for pencil.
  x: z.number().default(0),
  y: z.number().default(0),
  width: z.number().default(0),
  height: z.number().default(0),
  createdBy: objectId,
  createdAt: now(),
  updatedAt: now(),
});

export type IMapDrawing = z.infer<typeof mapDrawingSchema>;

export const MapDrawing = defineGraphModel<IMapDrawing>({
  name: 'mapDrawing',
  kind: 'MapDrawing',
  modelName: 'MapDrawing',
  schema: mapDrawingSchema,
  index: { mapId: 'ix_s1', campaignId: 'ix_s2' },
});
