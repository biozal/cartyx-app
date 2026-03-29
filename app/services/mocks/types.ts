export interface CatchUpContent {
  title: string
  content: string
  lastUpdated: string
}

export interface PartyMember {
  id: string
  name: string
  characterClass: string
  race: string
  avatarUrl?: string
}

export interface KeyAlly {
  id: string
  name: string
  town: string
  avatarUrl?: string
}

export interface Session {
  id: string
  number: number
  name: string
  summary: string
  date: string
}

export interface TimelineEvent {
  id: string
  calendarDate: string
  sessionName: string
  summary: string
  importance?: 'normal' | 'major'
  isCurrent?: boolean
}

export interface RecentlyUpdatedItem {
  id: string
  title: string
  type: 'Location' | 'NPC' | 'Quest' | 'Lore' | 'Faction' | 'Item'
  updatedAt: string
  summary: string
}
