export interface RuleData {
  id: string;
  campaignId: string;
  createdBy: string;
  title: string;
  content: string;
  tags: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RuleListItem {
  id: string;
  campaignId: string;
  createdBy: string;
  title: string;
  tags: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}
