import { z } from 'zod'

export const createNoteSchema = z.object({
  campaignId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1, 'Title is required'),
  note: z.string().trim().min(1, 'Note body is required'),
  tags: z.array(z.string()).optional().default([]),
  isPublic: z.boolean().optional().default(false),
})

export const updateNoteSchema = z.object({
  id: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1, 'Title is required'),
  note: z.string().trim().min(1, 'Note body is required'),
  tags: z.array(z.string()).optional().default([]),
  isPublic: z.boolean().optional(),
})

export const deleteNoteSchema = z.object({
  id: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
})

export const listNotesSchema = z.object({
  campaignId: z.string().min(1),
  sessionId: z.string().optional(),
  search: z.string().optional(),
  visibility: z.enum(['all', 'public', 'private']).optional().default('all'),
})

export const getNoteSchema = z.object({
  id: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
})
