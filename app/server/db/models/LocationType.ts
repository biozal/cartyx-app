import { z } from 'zod';
import { objectIdString } from '~/server/repositories/collection';
import { defineGraphModel } from '~/server/repositories/graph-model';

export const DEFAULT_LOCATION_TYPES = [
  'continent',
  'country',
  'region',
  'state',
  'province',
  'city',
  'town',
  'village',
  'cave',
  'dungeon',
  'planet',
] as const;

export const locationTypeSchema = z.object({
  _id: objectIdString,
  campaignId: objectIdString,
  name: z.string(),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().default(0),
});

export type ILocationType = z.infer<typeof locationTypeSchema>;

export const LocationType = defineGraphModel<ILocationType>({
  name: 'locationtype',
  kind: 'LocationType',
  modelName: 'LocationType',
  schema: locationTypeSchema,
  index: { campaignId: 'ix_s1', name: 'ix_s2', sortOrder: 'ix_n1' },
  unique: { campaignId_name: (type) => [type.campaignId, type.name] },
});

/**
 * Seed default location types for a campaign if none exist.
 * Called on first listLocationTypes request. Two first requests racing both seed; the
 * unique (campaignId, name) key lets exactly one copy of each default land.
 */
export async function seedDefaultLocationTypes(campaignId: string): Promise<void> {
  const count = await LocationType.countDocuments({ campaignId });
  if (count > 0) return;

  const docs = DEFAULT_LOCATION_TYPES.map((name, i) => ({
    campaignId,
    name,
    isDefault: true,
    sortOrder: i,
  }));

  try {
    await LocationType.insertMany(docs, { ordered: false });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
}
