import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { GRID_STYLES, TABLETOP_MODES } from '~/types/tabletop';
import { now, objectId, subdocumentId } from './schema-parts';

export const TABLETOP_LIMITS = {
  MAX_WINDOWS: 20,
} as const;

const windowSchema = z.object({
  _id: subdocumentId,
  collection: z.string(),
  documentId: objectId,
  state: z.enum(['open', 'minimized', 'hidden']).default('open'),
  x: z.number().nullable().default(null),
  y: z.number().nullable().default(null),
  width: z.number().nullable().default(null),
  height: z.number().nullable().default(null),
  zIndex: z.number().default(0),
});

export const tabletopScreenSchema = z.object({
  _id: objectId,
  campaignId: objectId,
  name: z.string(),
  tabOrder: z.number().default(0),
  createdBy: objectId,
  mode: z.enum(TABLETOP_MODES).default('grid'),
  gridStyle: z.enum(GRID_STYLES).default('dark'),
  gridSize: z.number().default(50),
  gridVisible: z.boolean().default(true),
  gridScale: z.number().default(5),
  locationId: objectId.nullable().default(null),
  battleMapImage: z.string().nullable().default(null),
  // The Map shown on this tab. Active map is per-tab (per screen), not
  // campaign-wide, so different tabs can display different maps.
  activeMapId: objectId.nullable().default(null),
  windows: z
    .array(windowSchema)
    .max(
      TABLETOP_LIMITS.MAX_WINDOWS,
      `A screen cannot contain more than ${TABLETOP_LIMITS.MAX_WINDOWS} windows.`
    )
    .default([]),
  createdAt: now(),
  updatedAt: now(),
});

export type ITabletopScreen = z.infer<typeof tabletopScreenSchema>;

export const TabletopScreen = defineGraphModel<ITabletopScreen>({
  name: 'tabletopscreen',
  kind: 'TabletopScreen',
  modelName: 'TabletopScreen',
  schema: tabletopScreenSchema,
  index: { campaignId: 'ix_s1', name: 'ix_s2', activeMapId: 'ix_s3', tabOrder: 'ix_n1' },
  unique: {
    campaignId_tabOrder: (screen) => [screen.campaignId, screen.tabOrder],
    campaignId_name: (screen) => [screen.campaignId, screen.name],
  },
});
