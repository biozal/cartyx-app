import { Location } from './Location';
import { LocationType } from './LocationType';
import { Tag } from './Tag';

/**
 * Every model that has moved to the graph, by its MongoDB collection name. The seeder,
 * the development reset and the E2E fixtures address collections by that name, so they
 * all follow this one list. A slice adds its models here.
 */
export const graphModels = {
  location: Location,
  locationtype: LocationType,
  tags: Tag,
} as const;

export type GraphModelName = keyof typeof graphModels;
