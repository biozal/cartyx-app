import { AudioAsset } from './AudioAsset';
import { AudioPackage } from './AudioPackage';
import { Calendar } from './Calendar';
import { Character } from './Character';
import { DiceRoll } from './DiceRoll';
import { Event } from './Event';
import { GMScreen } from './GMScreen';
import { Location } from './Location';
import { LocationType } from './LocationType';
import { Lore } from './Lore';
import { Map } from './Map';
import { MapAoE } from './MapAoE';
import { MapDrawing } from './MapDrawing';
import { MapText } from './MapText';
import { MapToken } from './MapToken';
import { Message } from './Message';
import { Monster } from './Monster';
import { Note } from './Note';
import { Organization } from './Organization';
import { OrganizationMembership } from './OrganizationMembership';
import { Player } from './Player';
import { Quest } from './Quest';
import { Race } from './Race';
import { RealtimeRoomMessage } from './RealtimeRoomMessage';
import { Rule } from './Rule';
import { Session } from './Session';
import { SessionEvent } from './SessionEvent';
import { SoundboardState } from './SoundboardState';
import { Spell } from './Spell';
import { TabletopPlayerState } from './TabletopPlayerState';
import { TabletopScreen } from './TabletopScreen';
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
  monsters: Monster,
  races: Race,
  rules: Rule,
  spells: Spell,
  map: Map,
  mapToken: MapToken,
  mapAoE: MapAoE,
  mapDrawing: MapDrawing,
  mapText: MapText,
  gmscreen: GMScreen,
  tabletopscreen: TabletopScreen,
  tabletopplayerstate: TabletopPlayerState,
  soundboardstates: SoundboardState,
  messages: Message,
  dicerolls: DiceRoll,
  audioassets: AudioAsset,
  audiopackages: AudioPackage,
  realtime_room_messages: RealtimeRoomMessage,
} as const;

export type GraphModelName = keyof typeof graphModels;
