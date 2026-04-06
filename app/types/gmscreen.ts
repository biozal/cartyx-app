export const WINDOW_STATES = ['open', 'minimized', 'hidden'] as const;
export type WindowState = (typeof WINDOW_STATES)[number];

export interface GMScreenData {
  id: string;
  campaignId: string;
  name: string;
  tabOrder: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WindowData {
  id: string;
  collection: string;
  documentId: string;
  state: WindowState;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  zIndex: number;
}

export interface StackItemData {
  id: string;
  collection: string;
  documentId: string;
  label: string;
}

export interface StackData {
  id: string;
  name: string;
  x: number | null;
  y: number | null;
  items: StackItemData[];
}

export interface HydratedDocument {
  id: string;
  collection: string;
  title: string;
  content: string;
  isPublic?: boolean;
  link?: string;
}

export interface GMScreenDetailData extends GMScreenData {
  windows: WindowData[];
  stacks: StackData[];
  hydrated: Record<string, HydratedDocument>;
}
