import { Calendar } from './Calendar';
import { Character } from './Character';
import { Event } from './Event';
import { Location } from './Location';
import { LocationType } from './LocationType';
import { Lore } from './Lore';
import { Note } from './Note';
import { Organization } from './Organization';
import { OrganizationMembership } from './OrganizationMembership';
import { Player } from './Player';
import { Quest } from './Quest';
import { Session } from './Session';
import { SessionEvent } from './SessionEvent';
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
  lores: Lore,
  quests: Quest,
  organizations: Organization,
  organizationmemberships: OrganizationMembership,
  events: Event,
  calendars: Calendar,
  notes: Note,
  sessions: Session,
  sessionevent: SessionEvent,
  players: Player,
  characters: Character,
} as const;

export type GraphModelName = keyof typeof graphModels;
