import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { DEFAULT_VOLUME } from '~/types/soundboard';
import { now, objectId, touch } from './schema-parts';

// One item's live playback state on the board. `itemId` is package-scoped (items
// live inside AudioPackage documents), so it is a plain string, not a reference.
const boardItemSchema = z.object({
  itemId: z.string(),
  playing: z.boolean().default(false),
  volume: z.number().default(DEFAULT_VOLUME),
});

// The GM board's live state, persisted per campaign so a mid-session reload does
// not silence the table. Its own collection: it takes debounced writes during play.
export const soundboardStateSchema = z.object({
  _id: objectId,
  campaignId: objectId,
  // Null: a campaign can have a live board with nothing loaded yet.
  packageId: objectId.nullable().default(null),
  // Package-scoped stable string id (Mood.id); null when no mood is selected.
  moodId: z.string().nullable().default(null),
  items: z.array(boardItemSchema).default([]),
  masterVolume: z.number().default(DEFAULT_VOLUME),
  // Stamped on every write with the user id, never an OAuth provider id.
  updatedBy: objectId,
  updatedAt: now(),
});

export type ISoundboardState = z.infer<typeof soundboardStateSchema>;

export const SoundboardState = defineGraphModel<ISoundboardState>({
  name: 'soundboardstates',
  kind: 'SoundboardState',
  modelName: 'SoundboardState',
  schema: soundboardStateSchema,
  index: { campaignId: 'ix_s1', packageId: 'ix_s2' },
  // One live state per campaign: saveBoardState's upsert depends on there being
  // exactly one document to write.
  unique: { campaignId: (state) => [state.campaignId] },
  preSave: touch,
});
