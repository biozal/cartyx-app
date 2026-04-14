export interface PictureCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CharacterData {
  id: string;
  campaignId: string;
  createdBy: string;
  firstName: string;
  lastName: string;
  race: string;
  characterClass: string;
  age: number | null;
  location: string;
  link: string;
  picture: string;
  pictureCrop: PictureCrop | null;
  notes: string;
  gmNotes: string;
  tags: string[];
  isPublic: boolean;
  sessionId?: string;
  sessions: string[];
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
}

export interface CharacterListItem {
  id: string;
  campaignId: string;
  createdBy: string;
  firstName: string;
  lastName: string;
  race: string;
  characterClass: string;
  age: number | null;
  location: string;
  link: string;
  picture: string;
  pictureCrop: PictureCrop | null;
  tags: string[];
  isPublic: boolean;
  sessionId?: string;
  sessions: string[];
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
}
