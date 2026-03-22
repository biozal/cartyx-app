import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getSession } from '../session'
import { connectDB, isDBConnected } from '../db/connection'
import { User } from '../db/models/User'
import { Campaign } from '../db/models/Campaign'
import { generateInviteCode, validateUrl, parseMaxPlayers, saveUploadedFile, MAX_IMAGE_BASE64_LENGTH } from '../utils/helpers'

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
  scheduleText: string
}

function buildScheduleText(schedule: {
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
}, gmId?: string): CampaignData {
  const schedule = c.schedule ?? null
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
    players: { current: 0, max: c.maxPlayers ?? 4 },
    nextSession:
      schedule?.dayOfWeek
        ? { day: schedule.dayOfWeek, time: schedule.time ?? 'TBD' }
        : null,
    isOwner: !!gmId && String(c.gameMasterId) === gmId,
    scheduleText: buildScheduleText(schedule),
  }
}

export const listCampaigns = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await getSession()
  if (!user) return []

  await connectDB()
  if (!isDBConnected()) return []

  const dbUser = await User.findOne({ providerId: user.id })
  const raw = dbUser
    ? await Campaign.find({ $or: [{ gameMasterId: dbUser._id }, { status: 'active' }] }).sort({ createdAt: -1 })
    : await Campaign.find({ status: 'active' }).sort({ createdAt: -1 })

  const gmId = dbUser ? String(dbUser._id) : undefined
  return raw.map(c => {
    const serialized = serializeCampaign(c as Parameters<typeof serializeCampaign>[0], gmId)
    // Redact invite code for non-owners
    if (!serialized.isOwner) {
      return { ...serialized, inviteCode: '' }
    }
    return serialized
  })
})

export const getCampaign = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const user = await getSession()
    if (!user) throw new Error('Not authenticated')

    await connectDB()
    if (!isDBConnected()) throw new Error('Database not available')

    const dbUser = await User.findOne({ providerId: user.id })
    const c = await Campaign.findById(data.id)
    if (!c) return null

    const gmId = dbUser ? String(dbUser._id) : undefined
    const isOwner = !!gmId && c.gameMasterId != null && String(c.gameMasterId) === gmId

    // Non-owners can only see active campaigns
    if (!isOwner && c.status !== 'active') return null

    const serialized = serializeCampaign(c as Parameters<typeof serializeCampaign>[0], gmId)

    // Redact invite code for non-owners
    if (!isOwner) {
      return { ...serialized, inviteCode: '' }
    }

    return serialized
  })

const campaignInputSchema = z.object({
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
  imageData: z.string().optional(),
  imageMime: z.string().optional(),
  imageName: z.string().optional(),
})

export const createCampaign = createServerFn({ method: 'POST' })
  .inputValidator(campaignInputSchema)
  .handler(async ({ data }) => {
    const user = await getSession()
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
        })
      } catch (e: unknown) {
        if ((e as { code?: number })?.code === 11000) { campaign = null; continue }
        throw e
      }
    }

    if (!campaign) throw new Error('Could not generate unique invite code')

    return {
      success: true,
      campaignId: String(campaign._id),
      inviteCode: campaign.inviteCode as string,
    }
  })

export const updateCampaign = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string(), ...campaignInputSchema.shape }))
  .handler(async ({ data }) => {
    const user = await getSession()
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
  })
