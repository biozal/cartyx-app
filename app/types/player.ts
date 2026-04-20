import type { PictureCrop } from './character';

export interface PlayerStatus {
  value: 'alive' | 'deceased';
  changedAt: string | null;
  changedBy: string | null;
}

export interface PlayerRelationship {
  characterId: string;
  descriptor: string;
  isPublic: boolean;
}

export interface PlayerData {
  id: string;
  campaignId: string;
  createdBy: string;
  firstName: string;
  lastName: string;
  race: string;
  characterClass: string;
  age: number;
  gender: string;
  location: string;
  link: string;
  picture: string;
  pictureCrop: PictureCrop | null;
  description: string;
  backstory: string;
  gmNotes: string;
  color: string;
  eyeColor: string;
  hairColor: string;
  weight: number | null;
  height: string;
  size: string;
  appearance: string;
  status: PlayerStatus;
  relationships: PlayerRelationship[];
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
}

export interface PlayerListItem {
  id: string;
  campaignId: string;
  createdBy: string;
  firstName: string;
  lastName: string;
  race: string;
  characterClass: string;
  color: string;
  picture: string;
  pictureCrop: PictureCrop | null;
  status: PlayerStatus;
  canEdit: boolean;
}
