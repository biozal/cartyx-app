import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getSession } from '../session'
import { connectDB, isDBConnected } from '../db/connection'
import { User } from '../db/models/User'
import { Campaign } from '../db/models/Campaign'
import { generateInviteCode, validateUrl, parseMaxPlayers, saveUploadedFile, MAX_IMAGE_BASE64_LENGTH } from '../utils/helpers'
import { serverCaptureException } from '../utils/posthog'

export interface CampaignData {
  id: string
  name: string
  description: string
  status: string
  inviteCode: string
  imagePath: string | null
  callUrl: string | null
  dndBeyondUrl: string | null
  maxPlayers: number
  schedule: {
    frequency: string | null
    dayOfWeek: string | null
    time: string | null
    timezone: string | null
  }
  players: { current: number; max: number }
  nextSession: { day: string; time: string } | null
  isOwner: boolean
  isMember: boolean
  scheduleText: string
}

export function buildScheduleText(schedule: {
  frequency?: string | null
  dayOfWeek?: string | null
  time?: string | null
  timezone?: string | null
} | null): string {
  if (!schedule) return 'Not scheduled'
  return (
    [schedule.frequency, schedule.dayOfWeek, schedule.time, schedule.timezone]
      .filter(Boolean)
      .join(' · ') || 'Not scheduled'
  )
}

function serializeCampaign(c: {
  _id: unknown
  name?: string
  description?: string
  status?: string
  inviteCode?: string
  imagePath?: string | null
  callUrl?: string | null
  dndBeyondUrl?: string | null
  maxPlayers?: number
  schedule?: { frequency?: string | null; dayOfWeek?: string | null; time?: string | null; timezone?: string | null } | null
  gameMasterId?: unknown
  members?: Array<{ userId: unknown; role?: string }>
}, gmId?: string, userId?: string): CampaignData {
  const schedule = c.schedule ?? null
  const members = c.members ?? []
  const playerCount = members.filter(m => m.role === 'player').length
  const isMember = userId ? members.some(m => String(m.userId) === userId) : false
  return {
    id: String(c._id),
    name: c.name ?? 'Untitled Campaign',
    description: c.description ?? '',
    status: c.status ?? 'active',
    inviteCode: c.inviteCode ?? '',
    imagePath: c.imagePath ?? null,
    callUrl: c.callUrl ?? null,
    dndBeyondUrl: c.dndBeyondUrl ?? null,
    maxPlayers: c.maxPlayers ?? 4,
    schedule: {
      frequency: schedule?.frequency ?? null,
      dayOfWeek: schedule?.dayOfWeek ?? null,
      time: schedule?.time ?? null,
      timezone: schedule?.timezone ?? null,
    },
    players: { current: playerCount, max: c.maxPlayers ?? 4 },
    nextSession:
      schedule?.dayOfWeek
        ? { day: schedule.dayOfWeek, time: schedule.time ?? 'TBD' }
        : null,
    isOwner: !!gmId && String(c.gameMasterId) === gmId,
    isMember,
    scheduleText: buildScheduleText(schedule),
  }
}

export const listCampaigns = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const user = await getSession()
    if (!user) return []

    await connectDB()
    if (!isDBConnected()) return []

    const dbUser = await User.findOne({ providerId: user.id })
    if (!dbUser) return []

    const raw = await Campaign.find({ 'members.userId': dbUser._id }).sort({ createdAt: -1 })

    const userId = String(dbUser._id)
    return raw.map(c => {
      const serialized = serializeCampaign(c as Parameters<typeof serializeCampaign>[0], userId, userId)
      // Redact invite code for non-owners
      if (!serialized.isOwner) {
        return { ...serialized, inviteCode: '' }
      }
      return serialized
    })
  } catch (e) {
    serverCaptureException(e, undefined, { action: 'listCampaigns' })
    throw e
  }
})

export const getCampaign = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    try {
      const user = await getSession()
      if (!user) throw new Error('Not authenticated')

      await connectDB()
      if (!isDBConnected()) throw new Error('Database not available')

      const dbUser = await User.findOne({ providerId: user.id })
      const c = await Campaign.findById(data.id)
      if (!c) return null

      const userId = dbUser ? String(dbUser._id) : undefined

      // Only members can see campaigns
      const isMember = userId
        ? (c.members ?? []).some((m: { userId: unknown }) => String(m.userId) === userId)
        : false
      if (!isMember) return null

      const isOwner = !!userId && c.gameMasterId != null && String(c.gameMasterId) === userId
      const serialized = serializeCampaign(c as Parameters<typeof serializeCampaign>[0], userId, userId)

      // Redact invite code for non-owners
      if (!isOwner) {
        return { ...serialized, inviteCode: '' }
      }

      return serialized
    } catch (e) {
      serverCaptureException(e, undefined, { action: 'getCampaign', campaignId: data.id })
      throw e
    }
  })

const campaignInputShape = {
  name: z.string().min(1),
  description: z.string().default(''),
  schedFreq: z.string().optional(),
  schedDay: z.string().optional(),
  schedTime: z.string().optional(),
  schedTz: z.string().optional(),
  callUrl: z.string().optional(),
  dndBeyondUrl: z.string().optional(),
  maxPlayers: z.union([z.string(), z.number()]).optional(),
  // base64 encoded image data (optional)
  imageData: z
    .string()
    .max(MAX_IMAGE_BASE64_LENGTH, 'Image must be under 5MB')
    .optional(),
  imageMime: z.string().optional(),
  imageName: z.string().optional(),
} as const

function imageFieldsRefinement<T extends { imageData?: string; imageMime?: string; imageName?: string }>(data: T): boolean {
  return (
    (!data.imageData && !data.imageMime && !data.imageName) ||
    (data.imageData !== undefined &&
      data.imageMime !== undefined &&
      data.imageName !== undefined)
  )
}
const imageFieldsMessage = {
  message: 'imageData, imageMime, and imageName must either all be provided or all be omitted',
  path: ['imageData'] as [string],
}

export const campaignInputSchema = z.object(campaignInputShape).refine(
  imageFieldsRefinement,
  imageFieldsMessage,
)

export const createCampaign = createServerFn({ method: 'POST' })
  .inputValidator(campaignInputSchema)
  .handler(async ({ data }) => {
    const user = await getSession()
    try {
      if (!user) throw new Error('Not authenticated')
      if (user.role !== 'gm') throw new Error('Only GMs can create campaigns')

      await connectDB()
      if (!isDBConnected()) throw new Error('Database not available')

      const { name, description, schedFreq, schedDay, schedTime, schedTz, callUrl, dndBeyondUrl, maxPlayers, imageData, imageMime, imageName } = data

      if (!name.trim()) throw new Error('Campaign name is required')

      const normalizedCallUrl = validateUrl(callUrl)
      if (normalizedCallUrl === false) throw new Error('callUrl must be a valid http or https URL')
      const normalizedDndUrl = validateUrl(dndBeyondUrl)
      if (normalizedDndUrl === false) throw new Error('dndBeyondUrl must be a valid http or https URL')

      const dbUser = await User.findOne({ providerId: user.id })
      if (!dbUser) throw new Error('User not found')

      let imagePath: string | null = null
      if (imageData && imageMime && imageName) {
        if (imageData.length > MAX_IMAGE_BASE64_LENGTH) {
          throw new Error('Image must be under 5MB')
        }
        const buffer = Buffer.from(imageData, 'base64')
        const file = new File([buffer], imageName, { type: imageMime })
        imagePath = await saveUploadedFile(file, 'uploads/campaigns')
      }

      let campaign = null
      let attempts = 0
      while (attempts < 10 && !campaign) {
        const inviteCode = generateInviteCode()
        const inUse = await Campaign.exists({ inviteCode })
        attempts++
        if (inUse) continue
        try {
          campaign = await Campaign.create({
            gameMasterId: dbUser._id,
            name: name.trim(),
            description: description.trim(),
            imagePath,
            schedule: {
              frequency: schedFreq ?? null,
              dayOfWeek: schedDay ?? null,
              time: schedTime ?? null,
              timezone: schedTz ?? null,
            },
            callUrl: normalizedCallUrl,
            dndBeyondUrl: normalizedDndUrl,
            maxPlayers: parseMaxPlayers(maxPlayers),
            inviteCode,
            members: [{ userId: dbUser._id, role: 'gm', joinedAt: new Date() }],
          })
        } catch (e: unknown) {
          if ((e as { code?: number })?.code === 11000) { campaign = null; continue }
          throw e
        }
      }

      if (!campaign) throw new Error('Could not generate unique invite code')

      // Sync User.campaigns array
      await User.updateOne(
        { _id: dbUser._id },
        { $push: { campaigns: { campaignId: campaign._id, joinedAt: new Date(), status: 'active' } } }
      )

      return {
        success: true,
        campaignId: String(campaign._id),
        inviteCode: campaign.inviteCode as string,
      }
    } catch (e) {
      serverCaptureException(e, user?.id, { action: 'createCampaign' })
      throw e
    }
  })

export const updateCampaign = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string(), ...campaignInputShape }).refine(imageFieldsRefinement, imageFieldsMessage))
  .handler(async ({ data }) => {
    const user = await getSession()
    try {
      if (!user) throw new Error('Not authenticated')

      await connectDB()
      if (!isDBConnected()) throw new Error('Database not available')

      const dbUser = await User.findOne({ providerId: user.id })
      if (!dbUser) throw new Error('User not found')

      const campaign = await Campaign.findById(data.id)
      if (!campaign) throw new Error('Campaign not found')
      if (String(campaign.gameMasterId) !== String(dbUser._id)) throw new Error('Forbidden')

      const { name, description, schedFreq, schedDay, schedTime, schedTz, callUrl, dndBeyondUrl, maxPlayers, imageData, imageMime, imageName } = data

      if (!name.trim()) throw new Error('Campaign name is required')

      const normalizedCallUrl = validateUrl(callUrl)
      if (normalizedCallUrl === false) throw new Error('callUrl must be a valid http or https URL')
      const normalizedDndUrl = validateUrl(dndBeyondUrl)
      if (normalizedDndUrl === false) throw new Error('dndBeyondUrl must be a valid http or https URL')

      campaign.name = name.trim()
      campaign.description = description.trim()
      campaign.schedule = {
        frequency: schedFreq ?? null,
        dayOfWeek: schedDay ?? null,
        time: schedTime ?? null,
        timezone: schedTz ?? null,
      }
      campaign.callUrl = normalizedCallUrl
      campaign.dndBeyondUrl = normalizedDndUrl
      campaign.maxPlayers = parseMaxPlayers(maxPlayers)
      campaign.updatedAt = new Date()

      if (imageData && imageMime && imageName) {
        if (imageData.length > MAX_IMAGE_BASE64_LENGTH) {
          throw new Error('Image must be under 5MB')
        }
        const buffer = Buffer.from(imageData, 'base64')
        const file = new File([buffer], imageName, { type: imageMime })
        campaign.imagePath = await saveUploadedFile(file, 'uploads/campaigns')
      }

      await campaign.save()
      return { success: true, campaignId: String(campaign._id) }
    } catch (e) {
      serverCaptureException(e, user?.id, { action: 'updateCampaign', campaignId: data.id })
      throw e
    }
  })

export const joinCampaign = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ inviteCode: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await getSession()
    try {
      if (!user) throw new Error('Not authenticated')

      await connectDB()
      if (!isDBConnected()) throw new Error('Database not available')

      const dbUser = await User.findOne({ providerId: user.id })
      if (!dbUser) throw new Error('User not found')

      const campaign = await Campaign.findOne({ inviteCode: data.inviteCode })
      if (!campaign) throw new Error('Invalid invite code')
      if (campaign.status !== 'active') throw new Error('Campaign is not active')

      const alreadyMember = (campaign.members ?? []).some(
        (m: { userId: unknown }) => String(m.userId) === String(dbUser._id)
      )
      if (alreadyMember) throw new Error('Already a member of this campaign')

      const playerCount = (campaign.members ?? []).filter(
        (m: { role?: string }) => m.role === 'player'
      ).length
      if (playerCount >= campaign.maxPlayers) throw new Error('Campaign is full')

      campaign.members.push({ userId: dbUser._id, role: 'player', joinedAt: new Date() })
      await campaign.save()

      await User.updateOne(
        { _id: dbUser._id },
        { $push: { campaigns: { campaignId: campaign._id, joinedAt: new Date(), status: 'active' } } }
      )

      return { success: true, campaignId: String(campaign._id) }
    } catch (e) {
      serverCaptureException(e, user?.id, { action: 'joinCampaign' })
      throw e
    }
  })
