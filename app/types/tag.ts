import { z } from 'zod'

export interface TagData {
  id: string
  name: string
  campaignId: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface TagListItem {
  id: string
  name: string
}

export const listTagsSchema = z.object({
  campaignId: z.string().min(1),
})

export const ensureTagsSchema = z.object({
  campaignId: z.string().min(1),
  tags: z.array(z.string()),
})
