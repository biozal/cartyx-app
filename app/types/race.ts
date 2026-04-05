export interface RaceData {
  id: string;
  campaignId: string;
  createdBy: string;
  title: string;
  content: string;
  tags: string[];
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RaceListItem {
  id: string;
  campaignId: string;
  createdBy: string;
  title: string;
  tags: string[];
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
}
