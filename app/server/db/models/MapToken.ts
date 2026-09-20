import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { TOKEN_SOURCES } from '~/types/schemas/mapTokens';
import { now, objectId } from './schema-parts';

export const mapTokenSchema = z.object({
  _id: objectId,
  mapId: objectId,
  // Denormalised for cheap auth checks (avoids a Map lookup per write).
  campaignId: objectId,
  // Derived from the shared schema so the model and Zod validator can't drift.
  sourceCollection: z.enum(TOKEN_SOURCES),
  sourceDocumentId: objectId,
  // Per-(map, source entity) instance number for sources that can appear more
  // than once on a map (monsters: Goblin A, Goblin B …). Null for players and
  // characters, which remain unique per entity.
  instanceNumber: z.number().nullable().default(null),
  // Populated for player-owned tokens so we can gate movement.
  ownerUserId: objectId.nullable().default(null),
  // Position in MAP-LOCAL pixel coordinates (the image's native pixel space).
  x: z.number(),
  y: z.number(),
  sizeSquares: z.number().default(1),
  color: z.string().default('#3498db'),
  label: z.string().default(''),
  imageUrl: z.string().default(''),
  labelVisible: z.boolean().default(true),
  hiddenFromPlayers: z.boolean().default(false),
  zIndex: z.number().default(0),
  createdBy: objectId,
  createdAt: now(),
  updatedAt: now(),
});

export type IMapToken = z.infer<typeof mapTokenSchema>;

export const MapToken = defineGraphModel<IMapToken>({
  name: 'mapToken',
  kind: 'MapToken',
  modelName: 'MapToken',
  schema: mapTokenSchema,
  index: { mapId: 'ix_s1', campaignId: 'ix_s2', sourceDocumentId: 'ix_s3' },
  // Unique per (map, source entity, instance). Players/characters leave
  // instanceNumber null → at most one per entity (re-drop refocuses, not
  // duplicates). Monsters get distinct instance numbers → many per entity.
  unique: {
    mapId_source_instance: (token) => [
      token.mapId,
      token.sourceCollection,
      token.sourceDocumentId,
      token.instanceNumber,
    ],
  },
});
