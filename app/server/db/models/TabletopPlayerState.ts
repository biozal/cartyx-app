import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { objectId, subdocumentId } from './schema-parts';

const viewportSchema = z.object({
  screenId: objectId,
  zoom: z.number().default(1),
  panX: z.number().default(0),
  panY: z.number().default(0),
});

const windowOverrideSchema = z.object({
  windowId: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  state: z.enum(['open', 'minimized', 'hidden']).default('open'),
});

const privateWindowSchema = z.object({
  _id: subdocumentId,
  surface: z.enum(['tabletop', 'gmscreen']),
  screenId: objectId,
  collection: z.string(),
  documentId: objectId,
  x: z.number().default(0),
  y: z.number().default(0),
  width: z.number().nullable().default(null),
  height: z.number().nullable().default(null),
  zIndex: z.number().default(0),
  state: z.enum(['open', 'minimized', 'hidden']).default('open'),
});

export const tabletopPlayerStateSchema = z.object({
  _id: objectId,
  campaignId: objectId,
  userId: objectId,
  activeScreenId: objectId.nullable().default(null),
  viewports: z.array(viewportSchema).default([]),
  windowOverrides: z.array(windowOverrideSchema).default([]),
  /**
   * The caller's active GM screen. Mirrors activeScreenId, which covers the
   * Tabletop only. Lives here because GMScreen is campaign-scoped and shared
   * between co-GMs, while this is per-user.
   */
  activeGMScreenId: objectId.nullable().default(null),
  /**
   * Windows only this user can see, across BOTH surfaces (see `surface`).
   * Distinct from TabletopScreen.windows[], which is shared and broadcast.
   */
  privateWindows: z.array(privateWindowSchema).default([]),
});

export type ITabletopPlayerState = z.infer<typeof tabletopPlayerStateSchema>;

export const TabletopPlayerState = defineGraphModel<ITabletopPlayerState>({
  name: 'tabletopplayerstate',
  kind: 'TabletopPlayerState',
  modelName: 'TabletopPlayerState',
  schema: tabletopPlayerStateSchema,
  index: { campaignId: 'ix_s1', userId: 'ix_s2' },
  unique: { campaignId_userId: (state) => [state.campaignId, state.userId] },
});
