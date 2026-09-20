import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { WINDOW_STATES } from '~/types/gmscreen';
import { now, objectId, subdocumentId } from './schema-parts';

// ---------------------------------------------------------------------------
// Constants – practical guardrails for embedded arrays
// ---------------------------------------------------------------------------
export const GMSCREEN_LIMITS = {
  MAX_WINDOWS: 20,
  MAX_STACKS: 10,
  MAX_STACK_ITEMS: 50,
} as const;

const windowSchema = z.object({
  _id: subdocumentId,
  collection: z.string(),
  documentId: objectId,
  state: z.enum(WINDOW_STATES).default('open'),
  x: z.number().nullable().default(null),
  y: z.number().nullable().default(null),
  width: z.number().nullable().default(null),
  height: z.number().nullable().default(null),
  zIndex: z.number().default(0),
});

const stackItemSchema = z.object({
  _id: subdocumentId,
  collection: z.string(),
  documentId: objectId,
  label: z.string().default(''),
});

const stackSchema = z.object({
  _id: subdocumentId,
  name: z.string(),
  x: z.number().nullable().default(null),
  y: z.number().nullable().default(null),
  items: z
    .array(stackItemSchema)
    .max(
      GMSCREEN_LIMITS.MAX_STACK_ITEMS,
      `A stack cannot contain more than ${GMSCREEN_LIMITS.MAX_STACK_ITEMS} items.`
    )
    .default([]),
});

export const gmScreenSchema = z.object({
  _id: objectId,
  campaignId: objectId,
  name: z.string(),
  tabOrder: z.number().default(0),
  createdBy: objectId,
  windows: z
    .array(windowSchema)
    .max(
      GMSCREEN_LIMITS.MAX_WINDOWS,
      `A screen cannot contain more than ${GMSCREEN_LIMITS.MAX_WINDOWS} windows.`
    )
    .default([]),
  stacks: z
    .array(stackSchema)
    .max(
      GMSCREEN_LIMITS.MAX_STACKS,
      `A screen cannot contain more than ${GMSCREEN_LIMITS.MAX_STACKS} stacks.`
    )
    .default([]),
  createdAt: now(),
  updatedAt: now(),
});

export type IGMScreen = z.infer<typeof gmScreenSchema>;

export const GMScreen = defineGraphModel<IGMScreen>({
  name: 'gmscreen',
  kind: 'GMScreen',
  modelName: 'GMScreen',
  schema: gmScreenSchema,
  index: { campaignId: 'ix_s1', name: 'ix_s2', tabOrder: 'ix_n1' },
  unique: {
    campaignId_tabOrder: (screen) => [screen.campaignId, screen.tabOrder],
    campaignId_name: (screen) => [screen.campaignId, screen.name],
  },
});
