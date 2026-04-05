import { createServerFn } from '@tanstack/react-start'
import { getSession } from '../session'
import { connectDB, isDBConnected } from '../db/connection'
import { User } from '../db/models/User'
import { Campaign } from '../db/models/Campaign'
import { Character } from '../db/models/Character'
import { serverCaptureException, serverCaptureEvent } from '../utils/posthog'
import { normalizeTags } from '../utils/helpers'
import { removeDocumentRefsFromScreens } from './gmscreens-helpers'
import { ensureTags as ensureTagsFn } from './tags'
import type { CharacterData, CharacterListItem, PictureCrop } from '~/types/character'
import {
  createCharacterSchema,
  updateCharacterSchema,
  deleteCharacterSchema,
  listCharactersSchema,
  getCharacterSchema,
} from '~/types/schemas/characters'


function serializeCharacter(c: {
  _id: unknown
  campaignId: unknown
  createdBy: unknown
  firstName?: string
  lastName?: string
  race?: string
  characterClass?: string
  age?: number | null
  location?: string
  link?: string
  picture?: string
  pictureCrop?: PictureCrop | null
  notes?: string
  gmNotes?: string
  tags?: string[]
  isPublic?: boolean
  sessionId?: unknown
  sessions?: unknown[]
  createdAt?: Date
  updatedAt?: Date
}): CharacterData {
  return {
    id: String(c._id),
    campaignId: String(c.campaignId),
    createdBy: String(c.createdBy),
    firstName: c.firstName ?? '',
    lastName: c.lastName ?? '',
    race: c.race ?? '',
    characterClass: c.characterClass ?? '',
    age: c.age ?? null,
    location: c.location ?? '',
    link: c.link ?? '',
    picture: c.picture ?? '',
    pictureCrop: c.pictureCrop ? { x: Number(c.pictureCrop.x), y: Number(c.pictureCrop.y), width: Number(c.pictureCrop.width), height: Number(c.pictureCrop.height) } : null,
    notes: c.notes ?? '',
    gmNotes: c.gmNotes ?? '',
    tags: c.tags ?? [],
    isPublic: c.isPublic ?? false,
    sessionId: c.sessionId ? String(c.sessionId) : undefined,
    sessions: (c.sessions ?? []).map(s => String(s)),
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : '',
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : '',
  }
}

function serializeCharacterListItem(c: {
  _id: unknown
  campaignId: unknown
  createdBy: unknown
  firstName?: string
  lastName?: string
  race?: string
  characterClass?: string
  age?: number | null
  location?: string
  link?: string
  picture?: string
  pictureCrop?: PictureCrop | null
  tags?: string[]
  isPublic?: boolean
  sessionId?: unknown
  sessions?: unknown[]
  createdAt?: Date
  updatedAt?: Date
}): CharacterListItem {
  return {
    id: String(c._id),
    campaignId: String(c.campaignId),
    createdBy: String(c.createdBy),
    firstName: c.firstName ?? '',
    lastName: c.lastName ?? '',
    race: c.race ?? '',
    characterClass: c.characterClass ?? '',
    age: c.age ?? null,
    location: c.location ?? '',
    link: c.link ?? '',
    picture: c.picture ?? '',
    pictureCrop: c.pictureCrop ? { x: Number(c.pictureCrop.x), y: Number(c.pictureCrop.y), width: Number(c.pictureCrop.width), height: Number(c.pictureCrop.height) } : null,
    tags: c.tags ?? [],
    isPublic: c.isPublic ?? false,
    sessionId: c.sessionId ? String(c.sessionId) : undefined,
    sessions: (c.sessions ?? []).map(s => String(s)),
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : '',
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : '',
  }
}

/**
 * Verify the authenticated user is a member of the given campaign.
 * Returns the DB user ID string, session user ID, and whether the user is the GM.
 */
async function requireCampaignMember(campaignId: string): Promise<{ userId: string; sessionUserId: string; isGM: boolean }> {
  const user = await getSession()
  if (!user) throw new Error('Not authenticated')

  await connectDB()
  if (!isDBConnected()) throw new Error('Database not available')

  const dbUser = await User.findOne({ providerId: user.id })
  if (!dbUser) throw new Error('User not found')

  const campaign = await Campaign.findById(campaignId)
  if (!campaign) throw new Error('Campaign not found')

  const userId = String(dbUser._id)
  const isGM = String(campaign.gameMasterId) === userId
  const members = campaign.members ?? []
  const isMember =
    members.some((m: { userId: unknown }) => String(m.userId) === userId) || isGM
  if (!isMember) throw new Error('Forbidden')

  return { userId, sessionUserId: user.id, isGM }
}

// ---------------------------------------------------------------------------
// createCharacter
// ---------------------------------------------------------------------------

export { createCharacterSchema }

export const createCharacter = createServerFn({ method: 'POST' })
  .inputValidator(createCharacterSchema)
  .handler(async ({ data }) => {
    let sessionUserId: string | undefined
    try {
      const member = await requireCampaignMember(data.campaignId)
      sessionUserId = member.sessionUserId
      const userId = member.userId

      const now = new Date()
      const finalTags = normalizeTags(data.tags ?? [])
      const charData: Record<string, unknown> = {
        campaignId: data.campaignId,
        createdBy: userId,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        race: (data.race ?? '').trim(),
        characterClass: (data.characterClass ?? '').trim(),
        age: data.age ?? null,
        location: (data.location ?? '').trim(),
        link: (data.link ?? '').trim(),
        picture: data.picture ?? '',
        pictureCrop: data.pictureCrop ?? null,
        notes: (data.notes ?? '').trim(),
        gmNotes: (data.gmNotes ?? '').trim(),
        tags: finalTags,
        isPublic: data.isPublic ?? false,
        sessions: data.sessions ?? [],
        createdAt: now,
        updatedAt: now,
      }
      if (data.sessionId && data.sessionId !== '__none__') {
        charData.sessionId = data.sessionId
      }
      const doc = await Character.create(charData)

      // Register any new tags in the campaign tag registry
      await ensureTagsFn({ data: { campaignId: data.campaignId, tags: finalTags } })

      serverCaptureEvent(sessionUserId, 'character_created', {
        campaign_id: data.campaignId,
        character_id: String(doc._id),
      })

      return { success: true, character: serializeCharacter(doc) }
    } catch (e) {
      serverCaptureException(e, sessionUserId, { action: 'createCharacter', campaignId: data.campaignId })
      throw e
    }
  })

// ---------------------------------------------------------------------------
// updateCharacter
// ---------------------------------------------------------------------------

export { updateCharacterSchema }

export const updateCharacter = createServerFn({ method: 'POST' })
  .inputValidator(updateCharacterSchema)
  .handler(async ({ data }) => {
    let sessionUserId: string | undefined
    try {
      const member = await requireCampaignMember(data.campaignId)
      sessionUserId = member.sessionUserId
      const userId = member.userId

      const existing = await Character.findById(data.id)
      if (!existing) throw new Error('Character not found')
      if (String(existing.campaignId) !== data.campaignId) throw new Error('Forbidden')
      if (String(existing.createdBy) !== userId) throw new Error('Forbidden')

      const finalTags = normalizeTags(data.tags ?? [])
      existing.sessionId = data.sessionId && data.sessionId !== '__none__' ? data.sessionId : undefined
      existing.firstName = data.firstName.trim()
      existing.lastName = data.lastName.trim()
      existing.race = (data.race ?? '').trim()
      existing.characterClass = (data.characterClass ?? '').trim()
      existing.age = data.age ?? null
      existing.location = (data.location ?? '').trim()
      existing.link = (data.link ?? '').trim()
      existing.picture = data.picture ?? ''
      existing.pictureCrop = data.pictureCrop ?? null
      existing.notes = (data.notes ?? '').trim()
      existing.gmNotes = (data.gmNotes ?? '').trim()
      existing.tags = finalTags
      existing.sessions = data.sessions ?? []
      if (data.isPublic !== undefined) {
        existing.isPublic = data.isPublic
      }
      existing.updatedAt = new Date()
      await existing.save()

      // Register any new tags in the campaign tag registry
      await ensureTagsFn({ data: { campaignId: data.campaignId, tags: finalTags } })

      serverCaptureEvent(sessionUserId, 'character_updated', {
        campaign_id: data.campaignId,
        character_id: data.id,
        updated_by: userId,
      })

      return { success: true, character: serializeCharacter(existing) }
    } catch (e) {
      serverCaptureException(e, sessionUserId, { action: 'updateCharacter', characterId: data.id })
      throw e
    }
  })

// ---------------------------------------------------------------------------
// deleteCharacter
// ---------------------------------------------------------------------------

export { deleteCharacterSchema }

export const deleteCharacter = createServerFn({ method: 'POST' })
  .inputValidator(deleteCharacterSchema)
  .handler(async ({ data }) => {
    let sessionUserId: string | undefined
    try {
      const member = await requireCampaignMember(data.campaignId)
      sessionUserId = member.sessionUserId
      const userId = member.userId

      const existing = await Character.findById(data.id)
      if (!existing) throw new Error('Character not found')
      if (String(existing.campaignId) !== data.campaignId) throw new Error('Forbidden')
      if (String(existing.createdBy) !== userId) throw new Error('Forbidden')

      await existing.deleteOne()

      // Clean up GM Screen references to this character.
      // Best-effort: the character is already deleted, so cleanup failure must not
      // surface as a user-facing error — report it and move on.
      try {
        await removeDocumentRefsFromScreens(data.campaignId, 'character', data.id)
      } catch (cleanupError) {
        serverCaptureException(cleanupError, sessionUserId, {
          action: 'deleteCharacter.cleanup',
          campaignId: data.campaignId,
          characterId: data.id,
        })
      }

      serverCaptureEvent(sessionUserId, 'character_deleted', {
        campaign_id: data.campaignId,
        character_id: data.id,
        deleted_by: userId,
      })

      return { success: true }
    } catch (e) {
      serverCaptureException(e, sessionUserId, { action: 'deleteCharacter', characterId: data.id })
      throw e
    }
  })

// ---------------------------------------------------------------------------
// listCharacters
// ---------------------------------------------------------------------------

export { listCharactersSchema }

export const listCharacters = createServerFn({ method: 'GET' })
  .inputValidator(listCharactersSchema)
  .handler(async ({ data }) => {
    let sessionUserId: string | undefined
    try {
      const member = await requireCampaignMember(data.campaignId)
      sessionUserId = member.sessionUserId
      const userId = member.userId

      // Build query filter
      const filter: Record<string, unknown> = { campaignId: data.campaignId }

      // Session filter: union of sessionId (introduced in) OR sessions array (appeared in)
      const sessionConditions: Record<string, unknown>[] = []

      if (data.sessionId === '__none__') {
        sessionConditions.push({ sessionId: { $exists: false } })
        sessionConditions.push({ sessions: { $size: 0 } })
      } else if (data.sessionId) {
        sessionConditions.push({ sessionId: data.sessionId })
        sessionConditions.push({ sessions: data.sessionId })
      }

      // Visibility filter
      let visibilityCondition: Record<string, unknown> | undefined
      if (data.visibility === 'public') {
        filter.isPublic = true
      } else if (data.visibility === 'private') {
        filter.isPublic = false
        filter.createdBy = userId
      } else {
        // visibility='all' (default): only characters the user is allowed to see
        visibilityCondition = { $or: [{ isPublic: true }, { createdBy: userId }] }
      }

      // Merge session and visibility conditions using $and when both use $or
      if (sessionConditions.length > 0 && visibilityCondition) {
        filter.$and = [
          { $or: sessionConditions },
          visibilityCondition,
        ]
      } else if (sessionConditions.length > 0) {
        filter.$or = sessionConditions
      } else if (visibilityCondition) {
        filter.$or = visibilityCondition.$or as Record<string, unknown>[]
      }

      if (data.search && data.search.trim()) {
        filter.$text = { $search: data.search.trim() }
      }

      if (data.tags && data.tags.length > 0) {
        const normalizedTags = [...new Set(normalizeTags(data.tags))]
        if (normalizedTags.length > 0) {
          filter.tags = { $all: normalizedTags }
        }
      }

      const docs = await Character.find(filter)
        .select('-notes -gmNotes')
        .sort({ updatedAt: -1 })
        .lean()

      return (docs as Array<{
        _id: unknown
        campaignId: unknown
        createdBy: unknown
        firstName?: string
        lastName?: string
        race?: string
        characterClass?: string
        age?: number | null
        location?: string
        link?: string
        picture?: string
        pictureCrop?: PictureCrop | null
        tags?: string[]
        isPublic?: boolean
        sessionId?: unknown
        sessions?: unknown[]
        createdAt?: Date
        updatedAt?: Date
      }>).map(serializeCharacterListItem)
    } catch (e) {
      serverCaptureException(e, sessionUserId, { action: 'listCharacters', campaignId: data.campaignId })
      throw e
    }
  })

// ---------------------------------------------------------------------------
// getCharacter
// ---------------------------------------------------------------------------

export { getCharacterSchema }

export const getCharacter = createServerFn({ method: 'GET' })
  .inputValidator(getCharacterSchema)
  .handler(async ({ data }) => {
    let sessionUserId: string | undefined
    try {
      const member = await requireCampaignMember(data.campaignId)
      sessionUserId = member.sessionUserId
      const userId = member.userId

      const doc = await Character.findById(data.id)
      if (!doc) return null
      if (String(doc.campaignId) !== data.campaignId) return null

      // Private characters are only visible to the creator
      if (!doc.isPublic && String(doc.createdBy) !== userId) {
        return null
      }

      const serialized = serializeCharacter(doc)

      // Strip gmNotes for non-GMs
      if (!member.isGM) {
        serialized.gmNotes = ''
      }

      return serialized
    } catch (e) {
      serverCaptureException(e, sessionUserId, { action: 'getCharacter', characterId: data.id })
      throw e
    }
  })
