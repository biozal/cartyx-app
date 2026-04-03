export interface NoteData {
  id: string
  campaignId: string
  sessionId: string
  createdBy: string
  title: string
  note: string
  tags: string[]
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

export interface NoteListItem {
  id: string
  campaignId: string
  sessionId: string
  createdBy: string
  title: string
  tags: string[]
  isPublic: boolean
  createdAt: string
  updatedAt: string
}
