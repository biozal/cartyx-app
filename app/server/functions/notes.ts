import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getSession } from '../session'
import { connectDB, isDBConnected } from '../db/connection'
import { User } from '../db/models/User'
import { Campaign } from '../db/models/Campaign'
import { Note } from '../db/models/Note'
import { serverCaptureException, serverCaptureEvent } from '../utils/posthog'
import { normalizeTags } from '../utils/helpers'
import { removeDocumentRefsFromScreens } from './gmscreens'

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

/** Lightweight shape returned by listNotes — omits the full note body. */
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

function serializeNote(n: {
  _id: unknown
  campaignId: unknown
  sessionId: unknown
  createdBy: unknown
  title?: string
  note?: string
  tags?: string[]
  isPublic?: boolean
  createdAt?: Date
  updatedAt?: Date
}): NoteData {
  return {
    id: String(n._id),
    campaignId: String(n.campaignId),
    sessionId: String(n.sessionId),
    createdBy: String(n.createdBy),
    title: n.title ?? '',
    note: n.note ?? '',
    tags: n.tags ?? [],
    isPublic: n.isPublic ?? false,
    createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : '',
    updatedAt: n.updatedAt instanceof Date ? n.updatedAt.toISOString() : '',
  }
}

function serializeNoteListItem(n: {
  _id: unknown
  campaignId: unknown
  sessionId: unknown
  createdBy: unknown
  title?: string
  tags?: string[]
  isPublic?: boolean
  createdAt?: Date
  updatedAt?: Date
}): NoteListItem {
  return {
    id: String(n._id),
    campaignId: String(n.campaignId),
    sessionId: String(n.sessionId),
    createdBy: String(n.createdBy),
    title: n.title ?? '',
    tags: n.tags ?? [],
    isPublic: n.isPublic ?? false,
    createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : '',
    updatedAt: n.updatedAt instanceof Date ? n.updatedAt.toISOString() : '',
  }
}

/**
 * Verify the authenticated user is a member of the given campaign.
 * Returns the DB user ID string, or throws.
 */
async function requireCampaignMember(campaignId: string): Promise<{ userId: string; sessionUserId: string }> {
  const user = await getSession()
  if (!user) throw new Error('Not authenticated')

  await connectDB()
  if (!isDBConnected()) throw new Error('Database not available')

  const dbUser = await User.findOne({ providerId: user.id })
  if (!dbUser) throw new Error('User not found')

  const campaign = await Campaign.findById(campaignId)
  if (!campaign) throw new Error('Campaign not found')

  const userId = String(dbUser._id)
  const members = campaign.members ?? []
  const isMember =
    members.some((m: { userId: unknown }) => String(m.userId) === userId) ||
    String(campaign.gameMasterId) === userId
  if (!isMember) throw new Error('Forbidden')

  return { userId, sessionUserId: user.id }
}

// ---------------------------------------------------------------------------
// createNote
// ---------------------------------------------------------------------------

const createNoteSchema = z.object({
  campaignId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  title: z.string().trim().min(1, 'Title is required'),
  note: z.string().trim().min(1, 'Note body is required'),
  tags: z.array(z.string()).optional().default([]),
  isPublic: z.boolean().optional().default(false),
})

export { createNoteSchema }

export const createNote = createServerFn({ method: 'POST' })
  .inputValidator(createNoteSchema)
  .handler(async ({ data }) => {
    let sessionUserId: string | undefined
    try {
      const member = await requireCampaignMember(data.campaignId)
      sessionUserId = member.sessionUserId
      const userId = member.userId

      const now = new Date()
      const doc = await Note.create({
        campaignId: data.campaignId,
        sessionId: data.sessionId,
        createdBy: userId,
        title: data.title.trim(),
        note: data.note.trim(),
        tags: normalizeTags(data.tags ?? []),
        isPublic: data.isPublic ?? false,
        createdAt: now,
        updatedAt: now,
      })

      serverCaptureEvent(sessionUserId, 'note_created', {
        campaign_id: data.campaignId,
        note_id: String(doc._id),
      })

      return { success: true, note: serializeNote(doc) }
    } catch (e) {
      serverCaptureException(e, sessionUserId, { action: 'createNote', campaignId: data.campaignId })
      throw e
    }
  })

// ---------------------------------------------------------------------------
// updateNote
// ---------------------------------------------------------------------------

const updateNoteSchema = z.object({
  id: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  title: z.string().trim().min(1, 'Title is required'),
  note: z.string().trim().min(1, 'Note body is required'),
  tags: z.array(z.string()).optional().default([]),
  isPublic: z.boolean().optional(),
})

export { updateNoteSchema }

export const updateNote = createServerFn({ method: 'POST' })
  .inputValidator(updateNoteSchema)
  .handler(async ({ data }) => {
    let sessionUserId: string | undefined
    try {
      const member = await requireCampaignMember(data.campaignId)
      sessionUserId = member.sessionUserId
      const userId = member.userId

      const existing = await Note.findById(data.id)
      if (!existing) throw new Error('Note not found')
      if (String(existing.campaignId) !== data.campaignId) throw new Error('Forbidden')
      if (String(existing.createdBy) !== userId) throw new Error('Forbidden')
      if (existing.isReadOnly) throw new Error('Note is read-only')

      existing.sessionId = data.sessionId
      existing.title = data.title.trim()
      existing.note = data.note.trim()
      existing.tags = normalizeTags(data.tags ?? [])
      if (data.isPublic !== undefined) {
        existing.isPublic = data.isPublic
      }
      existing.updatedAt = new Date()
      await existing.save()

      serverCaptureEvent(sessionUserId, 'note_updated', {
        campaign_id: data.campaignId,
        note_id: data.id,
        updated_by: userId,
      })

      return { success: true, note: serializeNote(existing) }
    } catch (e) {
      serverCaptureException(e, sessionUserId, { action: 'updateNote', noteId: data.id })
      throw e
    }
  })

// ---------------------------------------------------------------------------
// deleteNote
// ---------------------------------------------------------------------------

const deleteNoteSchema = z.object({
  id: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
})

export { deleteNoteSchema }

export const deleteNote = createServerFn({ method: 'POST' })
  .inputValidator(deleteNoteSchema)
  .handler(async ({ data }) => {
    let sessionUserId: string | undefined
    try {
      const member = await requireCampaignMember(data.campaignId)
      sessionUserId = member.sessionUserId
      const userId = member.userId

      const existing = await Note.findById(data.id)
      if (!existing) throw new Error('Note not found')
      if (String(existing.campaignId) !== data.campaignId) throw new Error('Forbidden')
      if (String(existing.createdBy) !== userId) throw new Error('Forbidden')
      if (existing.isReadOnly) throw new Error('Note is read-only')

      await existing.deleteOne()

      // Clean up GM Screen references to this note.
      // Best-effort: the note is already deleted, so cleanup failure must not
      // surface as a user-facing error — report it and move on.
      try {
        await removeDocumentRefsFromScreens(data.campaignId, 'note', data.id)
      } catch (cleanupError) {
        serverCaptureException(cleanupError, sessionUserId, {
          action: 'deleteNote.cleanup',
          campaignId: data.campaignId,
          noteId: data.id,
        })
      }

      serverCaptureEvent(sessionUserId, 'note_deleted', {
        campaign_id: data.campaignId,
        note_id: data.id,
        deleted_by: userId,
      })

      return { success: true }
    } catch (e) {
      serverCaptureException(e, sessionUserId, { action: 'deleteNote', noteId: data.id })
      throw e
    }
  })

// ---------------------------------------------------------------------------
// listNotes
// ---------------------------------------------------------------------------

const listNotesSchema = z.object({
  campaignId: z.string().min(1),
  sessionId: z.string().optional(),
  search: z.string().optional(),
  visibility: z.enum(['all', 'public', 'private']).optional().default('all'),
})

export { listNotesSchema }

export const listNotes = createServerFn({ method: 'GET' })
  .inputValidator(listNotesSchema)
  .handler(async ({ data }) => {
    let sessionUserId: string | undefined
    try {
      const member = await requireCampaignMember(data.campaignId)
      sessionUserId = member.sessionUserId
      const userId = member.userId

      // Build query filter
      const filter: Record<string, unknown> = { campaignId: data.campaignId }

      if (data.sessionId) {
        filter.sessionId = data.sessionId
      }

      if (data.visibility === 'public') {
        filter.isPublic = true
      } else if (data.visibility === 'private') {
        filter.isPublic = false
        filter.createdBy = userId
      } else {
        // visibility='all' (default): only notes the user is allowed to see
        filter.$or = [{ isPublic: true }, { createdBy: userId }]
      }

      if (data.search && data.search.trim()) {
        filter.$text = { $search: data.search.trim() }
      }

      const docs = await Note.find(filter)
        .select('-note')
        .sort({ updatedAt: -1 })
        .lean()

      return (docs as Array<{
        _id: unknown
        campaignId: unknown
        sessionId: unknown
        createdBy: unknown
        title?: string
        tags?: string[]
        isPublic?: boolean
        createdAt?: Date
        updatedAt?: Date
      }>).map(serializeNoteListItem)
    } catch (e) {
      serverCaptureException(e, sessionUserId, { action: 'listNotes', campaignId: data.campaignId })
      throw e
    }
  })

// ---------------------------------------------------------------------------
// getNote
// ---------------------------------------------------------------------------

const getNoteSchema = z.object({
  id: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
})

export { getNoteSchema }

export const getNote = createServerFn({ method: 'GET' })
  .inputValidator(getNoteSchema)
  .handler(async ({ data }) => {
    let sessionUserId: string | undefined
    try {
      const member = await requireCampaignMember(data.campaignId)
      sessionUserId = member.sessionUserId
      const userId = member.userId

      const doc = await Note.findById(data.id)
      if (!doc) return null
      if (String(doc.campaignId) !== data.campaignId) return null

      // Private notes are only visible to the creator
      if (!doc.isPublic && String(doc.createdBy) !== userId) {
        return null
      }

      return serializeNote(doc)
    } catch (e) {
      serverCaptureException(e, sessionUserId, { action: 'getNote', noteId: data.id })
      throw e
    }
  })
