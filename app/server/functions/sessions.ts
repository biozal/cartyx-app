import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getSession } from '../session'
import { connectDB, isDBConnected } from '../db/connection'
import { User } from '../db/models/User'
import { Campaign } from '../db/models/Campaign'
import { Session } from '../db/models/Session'
import { serverCaptureException, serverCaptureEvent } from '../utils/posthog'

/**
 * Validates auth, connects to DB, and verifies the current user is the GM of the given campaign.
 * Returns { user, dbUser, campaign } on success; throws on failure.
 */
async function requireGM(campaignId: string) {
  const user = await getSession()
  if (!user) throw new Error('Not authenticated')

  await connectDB()
  if (!isDBConnected()) throw new Error('Database not available')

  const dbUser = await User.findOne({ providerId: user.id })
  if (!dbUser) throw new Error('User not found')

  const campaign = await Campaign.findById(campaignId)
  if (!campaign) throw new Error('Campaign not found')
  if (String(campaign.gameMasterId) !== String(dbUser._id)) throw new Error('Forbidden')

  return { user, dbUser, campaign }
}

export const listSessions = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      campaignId: z.string().min(1),
      includeCompleted: z.boolean().optional(),
    })
  )
  .handler(async ({ data }) => {
    try {
      await requireGM(data.campaignId)

      const filter: Record<string, unknown> = { campaignId: data.campaignId }
      if (!data.includeCompleted) {
        filter.endDate = null
      }

      const sessions = await Session.find(
        filter,
        '_id name number startDate endDate isActive createdAt updatedAt'
      )
        .sort({ startDate: -1 })
        .lean()

      return (
        sessions as Array<{
          _id: unknown
          name: string
          number: number
          startDate: Date
          endDate: Date | null
          isActive: boolean
        }>
      ).map((s) => ({
        id: String(s._id),
        name: s.name,
        number: s.number,
        startDate: s.startDate.toISOString(),
        endDate: s.endDate ? s.endDate.toISOString() : null,
        isActive: Boolean(s.isActive),
      }))
    } catch (e) {
      serverCaptureException(e, undefined, {
        action: 'listSessions',
        campaignId: data.campaignId,
      })
      throw e
    }
  })

export const createSession = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      campaignId: z.string().min(1),
      name: z.string().trim().min(1),
      startDate: z.string().datetime(),
    })
  )
  .handler(async ({ data }) => {
    try {
      const { user, dbUser } = await requireGM(data.campaignId)

      const lastSession = await Session.findOne({ campaignId: data.campaignId })
        .sort({ number: -1 })
        .select('number')
        .lean() as { number: number } | null
      const number = lastSession ? lastSession.number + 1 : 0

      const session = await Session.create({
        campaignId: data.campaignId,
        name: data.name,
        gm: dbUser._id,
        number,
        startDate: new Date(data.startDate),
        isActive: false,
      })

      serverCaptureEvent(user.id, 'session_created', {
        campaign_id: data.campaignId,
        session_id: String(session._id),
        session_name: data.name,
      })

      return { success: true, sessionId: String(session._id) }
    } catch (e) {
      serverCaptureException(e, undefined, {
        action: 'createSession',
        campaignId: data.campaignId,
      })
      throw e
    }
  })

export const updateSession = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      sessionId: z.string().min(1),
      campaignId: z.string().min(1),
      name: z.string().min(1).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })
  )
  .handler(async ({ data }) => {
    try {
      const { user } = await requireGM(data.campaignId)

      const session = await Session.findOne({
        _id: data.sessionId,
        campaignId: data.campaignId,
      })
      if (!session) throw new Error('Session not found')

      const setFields: Record<string, unknown> = {
        updatedAt: new Date(),
      }

      if (data.name !== undefined) setFields.name = data.name
      if (data.startDate !== undefined) setFields.startDate = new Date(data.startDate)
      if (data.endDate !== undefined) setFields.endDate = new Date(data.endDate)

      await Session.updateOne({ _id: data.sessionId }, { $set: setFields })

      serverCaptureEvent(user.id, 'session_updated', {
        campaign_id: data.campaignId,
        session_id: data.sessionId,
      })

      return { success: true }
    } catch (e) {
      serverCaptureException(e, undefined, {
        action: 'updateSession',
        campaignId: data.campaignId,
        sessionId: data.sessionId,
      })
      throw e
    }
  })
