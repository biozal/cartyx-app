import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import mongoose from 'mongoose'
import { getSession } from '../session'
import { connectDB, isDBConnected } from '../db/connection'
import { User } from '../db/models/User'
import { Campaign } from '../db/models/Campaign'
import { GMScreen } from '../db/models/GMScreen'
import { serverCaptureException, serverCaptureEvent } from '../utils/posthog'

// ---------------------------------------------------------------------------
// Serialized types
// ---------------------------------------------------------------------------

export interface GMScreenData {
  id: string
  campaignId: string
  name: string
  tabOrder: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

function serializeGMScreen(doc: {
  _id: unknown
  campaignId: unknown
  name?: string
  tabOrder?: number
  createdBy: unknown
  createdAt?: Date
  updatedAt?: Date
}): GMScreenData {
  return {
    id: String(doc._id),
    campaignId: String(doc.campaignId),
    name: doc.name ?? '',
    tabOrder: doc.tabOrder ?? 0,
    createdBy: String(doc.createdBy),
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : '',
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : '',
  }
}

function isDuplicateKeyError(e: unknown, field: string): boolean {
  if (typeof e !== 'object' || e === null) return false
  const err = e as { code?: number; keyPattern?: Record<string, unknown>; message?: string }
  if (err.code !== 11000) return false
  if (err.keyPattern) return field in err.keyPattern
  return typeof err.message === 'string' && err.message.includes(field)
}

// ---------------------------------------------------------------------------
// Auth helper — requires the caller to be a GM for the campaign
// ---------------------------------------------------------------------------

async function requireCampaignGM(campaignId: string): Promise<{ userId: string; sessionUserId: string }> {
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

  // GM access: user is the gameMasterId OR has role 'gm' in members
  const isGM =
    String(campaign.gameMasterId) === userId ||
    members.some((m: { userId: unknown; role?: string }) => String(m.userId) === userId && m.role === 'gm')
  if (!isGM) throw new Error('Forbidden')

  return { userId, sessionUserId: user.id }
}

// ---------------------------------------------------------------------------
// listGMScreens
// ---------------------------------------------------------------------------

const listGMScreensSchema = z.object({
  campaignId: z.string().trim().min(1),
})

export { listGMScreensSchema }

export const listGMScreens = createServerFn({ method: 'GET' })
  .inputValidator(listGMScreensSchema)
  .handler(async ({ data }) => {
    let sessionUserId: string | undefined
    try {
      const gm = await requireCampaignGM(data.campaignId)
      sessionUserId = gm.sessionUserId

      const docs = await GMScreen.find(
        { campaignId: data.campaignId },
        '_id campaignId name tabOrder createdBy createdAt updatedAt',
      )
        .sort({ tabOrder: 1 })
        .lean()

      return (docs as Array<{
        _id: unknown
        campaignId: unknown
        name?: string
        tabOrder?: number
        createdBy: unknown
        createdAt?: Date
        updatedAt?: Date
      }>).map(serializeGMScreen)
    } catch (e) {
      serverCaptureException(e, sessionUserId, { action: 'listGMScreens', campaignId: data.campaignId })
      throw e
    }
  })

// ---------------------------------------------------------------------------
// createGMScreen
// ---------------------------------------------------------------------------

const createGMScreenSchema = z.object({
  campaignId: z.string().trim().min(1),
  name: z.string().trim().min(1, 'Screen name is required'),
})

export { createGMScreenSchema }

const MAX_TAB_ORDER_RETRIES = 3

export const createGMScreen = createServerFn({ method: 'POST' })
  .inputValidator(createGMScreenSchema)
  .handler(async ({ data }) => {
    let sessionUserId: string | undefined
    try {
      const gm = await requireCampaignGM(data.campaignId)
      sessionUserId = gm.sessionUserId

      let doc: { _id: unknown; campaignId: unknown; name?: string; tabOrder?: number; createdBy: unknown; createdAt?: Date; updatedAt?: Date }

      for (let attempt = 0; attempt < MAX_TAB_ORDER_RETRIES; attempt++) {
        const mongoSession = await mongoose.startSession()
        try {
          doc = await mongoSession.withTransaction(async () => {
            const last = await GMScreen.findOne({ campaignId: data.campaignId })
              .sort({ tabOrder: -1 })
              .select('tabOrder')
              .session(mongoSession)
              .lean() as { tabOrder?: number } | null

            const nextOrder = (last?.tabOrder ?? -1) + 1

            const now = new Date()
            const [created] = await GMScreen.create([{
              campaignId: data.campaignId,
              name: data.name.trim(),
              tabOrder: nextOrder,
              createdBy: gm.userId,
              createdAt: now,
              updatedAt: now,
            }], { session: mongoSession })

            return created
          })
        } catch (e) {
          if (isDuplicateKeyError(e, 'tabOrder') && attempt < MAX_TAB_ORDER_RETRIES - 1) {
            continue
          }
          throw e
        } finally {
          await mongoSession.endSession()
        }

        serverCaptureEvent(sessionUserId, 'gmscreen_created', {
          campaign_id: data.campaignId,
          screen_id: String(doc._id),
        })

        return { success: true, screen: serializeGMScreen(doc) }
      }

      throw new Error('Failed to allocate tabOrder after retries')
    } catch (e) {
      if (isDuplicateKeyError(e, 'name')) {
        throw new Error('A screen with that name already exists in this campaign')
      }
      serverCaptureException(e, sessionUserId, { action: 'createGMScreen', campaignId: data.campaignId })
      throw e
    }
  })

// ---------------------------------------------------------------------------
// renameGMScreen
// ---------------------------------------------------------------------------

const renameGMScreenSchema = z.object({
  id: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
  name: z.string().trim().min(1, 'Screen name is required'),
})

export { renameGMScreenSchema }

export const renameGMScreen = createServerFn({ method: 'POST' })
  .inputValidator(renameGMScreenSchema)
  .handler(async ({ data }) => {
    let sessionUserId: string | undefined
    try {
      const gm = await requireCampaignGM(data.campaignId)
      sessionUserId = gm.sessionUserId

      const screen = await GMScreen.findById(data.id)
      if (!screen) throw new Error('Screen not found')
      if (String(screen.campaignId) !== data.campaignId) throw new Error('Forbidden')

      screen.name = data.name.trim()
      screen.updatedAt = new Date()
      await screen.save()

      serverCaptureEvent(sessionUserId, 'gmscreen_renamed', {
        campaign_id: data.campaignId,
        screen_id: data.id,
      })

      return { success: true, screen: serializeGMScreen(screen) }
    } catch (e) {
      if ((e as { code?: number })?.code === 11000) {
        throw new Error('A screen with that name already exists in this campaign')
      }
      serverCaptureException(e, sessionUserId, { action: 'renameGMScreen', screenId: data.id })
      throw e
    }
  })

// ---------------------------------------------------------------------------
// deleteGMScreen
// ---------------------------------------------------------------------------

const deleteGMScreenSchema = z.object({
  id: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
})

export { deleteGMScreenSchema }

export const deleteGMScreen = createServerFn({ method: 'POST' })
  .inputValidator(deleteGMScreenSchema)
  .handler(async ({ data }) => {
    let sessionUserId: string | undefined
    try {
      const gm = await requireCampaignGM(data.campaignId)
      sessionUserId = gm.sessionUserId

      // Use a transaction so the count-check + delete is atomic
      const mongoSession = await mongoose.startSession()
      let deletedTabOrder: number
      try {
        deletedTabOrder = await mongoSession.withTransaction(async () => {
          const screen = await GMScreen.findOne(
            { _id: data.id, campaignId: data.campaignId },
          ).session(mongoSession)
          if (!screen) throw new Error('Screen not found')

          const count = await GMScreen.countDocuments({ campaignId: data.campaignId }).session(mongoSession)
          if (count <= 1) throw new Error('Cannot delete the last screen')

          const tabOrder = screen.tabOrder as number
          await GMScreen.deleteOne({ _id: data.id, campaignId: data.campaignId }).session(mongoSession)

          return tabOrder
        })
      } finally {
        await mongoSession.endSession()
      }

      // Return the remaining screens so the client can resolve the next active screen
      const remaining = await GMScreen.find(
        { campaignId: data.campaignId },
        '_id campaignId name tabOrder createdBy createdAt updatedAt',
      )
        .sort({ tabOrder: 1 })
        .lean()

      serverCaptureEvent(sessionUserId, 'gmscreen_deleted', {
        campaign_id: data.campaignId,
        screen_id: data.id,
      })

      return {
        success: true,
        deletedTabOrder,
        remaining: (remaining as Array<{
          _id: unknown
          campaignId: unknown
          name?: string
          tabOrder?: number
          createdBy: unknown
          createdAt?: Date
          updatedAt?: Date
        }>).map(serializeGMScreen),
      }
    } catch (e) {
      serverCaptureException(e, sessionUserId, { action: 'deleteGMScreen', screenId: data.id })
      throw e
    }
  })

// ---------------------------------------------------------------------------
// reorderGMScreens
// ---------------------------------------------------------------------------

const reorderGMScreensSchema = z.object({
  campaignId: z.string().trim().min(1),
  screenIds: z.array(z.string().trim().min(1)).min(1, 'At least one screen ID is required'),
})

export { reorderGMScreensSchema }

export const reorderGMScreens = createServerFn({ method: 'POST' })
  .inputValidator(reorderGMScreensSchema)
  .handler(async ({ data }) => {
    let sessionUserId: string | undefined
    try {
      const gm = await requireCampaignGM(data.campaignId)
      sessionUserId = gm.sessionUserId

      // Use a transaction for atomic read + bulkWrite
      const mongoSession = await mongoose.startSession()
      try {
        await mongoSession.withTransaction(async () => {
          const screens = await GMScreen.find(
            { campaignId: data.campaignId },
            '_id',
          ).session(mongoSession).lean() as Array<{ _id: unknown }>

          const existingIds = new Set(screens.map(s => String(s._id)))

          // Validate input is a full permutation: no duplicates, no missing screens
          const inputIds = new Set(data.screenIds)
          if (inputIds.size !== data.screenIds.length) {
            throw new Error('Duplicate screen IDs in reorder request')
          }
          for (const id of data.screenIds) {
            if (!existingIds.has(id)) {
              throw new Error(`Screen ${id} not found in this campaign`)
            }
          }
          for (const id of existingIds) {
            if (!inputIds.has(id)) {
              throw new Error(`Missing screen ${id} in reorder request`)
            }
          }

          // Atomic bulkWrite with campaignId in each filter
          const now = new Date()
          await GMScreen.bulkWrite(
            data.screenIds.map((id, index) => ({
              updateOne: {
                filter: { _id: id, campaignId: data.campaignId },
                update: { $set: { tabOrder: index, updatedAt: now } },
              },
            })),
            { session: mongoSession },
          )
        })
      } finally {
        await mongoSession.endSession()
      }

      serverCaptureEvent(sessionUserId, 'gmscreens_reordered', {
        campaign_id: data.campaignId,
        screen_count: data.screenIds.length,
      })

      // Return the freshly ordered screens
      const ordered = await GMScreen.find(
        { campaignId: data.campaignId },
        '_id campaignId name tabOrder createdBy createdAt updatedAt',
      )
        .sort({ tabOrder: 1 })
        .lean()

      return {
        success: true,
        screens: (ordered as Array<{
          _id: unknown
          campaignId: unknown
          name?: string
          tabOrder?: number
          createdBy: unknown
          createdAt?: Date
          updatedAt?: Date
        }>).map(serializeGMScreen),
      }
    } catch (e) {
      serverCaptureException(e, sessionUserId, { action: 'reorderGMScreens', campaignId: data.campaignId })
      throw e
    }
  })
