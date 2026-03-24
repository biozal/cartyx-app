import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getSession } from '../session'
import { connectDB, isDBConnected } from '../db/connection'
import { User } from '../db/models/User'
import { Campaign } from '../db/models/Campaign'
import { Player } from '../db/models/Player'
import { generateInviteCode, parseMaxPlayers, saveUploadedFile, MAX_IMAGE_BASE64_LENGTH } from '../utils/helpers'
import { serverCaptureException, serverCaptureEvent } from '../utils/posthog'
import { formatSchedule } from '~/utils/date'

export interface CampaignData {
  id: string
  name: string
  description: string
  status: string
  inviteCode: string
  imagePath: string | null
  links: Array<{ name: string; url: string }>
  maxPlayers: number
  schedule: {
    frequency: string | null
    dayOfWeek: string | null
    time: string | null
    timezone: string | null
  }
  players: { current: number; max: number }
  partyMembers: Array<{ id: string; characterName: string; characterClass: string; avatar: string | null; userId: string }>
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
  return formatSchedule(schedule)
}

function serializeCampaign(c: {
  _id: unknown
  name?: string
  description?: string
  status?: string
  inviteCode?: string
  imagePath?: string | null
  links?: Array<{ name?: string; url?: string }> | null
  maxPlayers?: number
  schedule?: { frequency?: string | null; dayOfWeek?: string | null; time?: string | null; timezone?: string | null } | null
  gameMasterId?: unknown
  members?: Array<{ userId: unknown; role?: string }>
}, gmId?: string, userId?: string, partyMembers: Array<{ id: string; characterName: string; characterClass: string; avatar: string | null; userId: string }> = []): CampaignData {
  const schedule = c.schedule ?? null
  const members = c.members ?? []
  const playerCount = members.filter(m => m.role === 'player').length
  // Treat GM as implicit member for legacy campaigns (no members array)
  const isMember = userId
    ? members.some(m => String(m.userId) === userId) || String(c.gameMasterId) === userId
    : false
  return {
    id: String(c._id),
    name: c.name ?? 'Untitled Campaign',
    description: c.description ?? '',
    status: c.status ?? 'active',
    inviteCode: c.inviteCode ?? '',
    imagePath: c.imagePath ?? null,
    links: (c.links ?? []).map(l => ({ name: l.name ?? '', url: l.url ?? '' })),
    maxPlayers: c.maxPlayers ?? 4,
    schedule: {
      frequency: schedule?.frequency ?? null,
      dayOfWeek: schedule?.dayOfWeek ?? null,
      time: schedule?.time ?? null,
      timezone: schedule?.timezone ?? null,
    },
    players: { current: playerCount, max: c.maxPlayers ?? 4 },
    partyMembers,
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

    // Include legacy campaigns (pre-members migration) where user is the GM
    const raw = await Campaign.find({
      $or: [
        { 'members.userId': dbUser._id },
        { gameMasterId: dbUser._id, members: { $in: [null, []] } },
        // Ensure the GM always sees their campaigns, even if members is non-empty and missing the GM
        { gameMasterId: dbUser._id },
      ],
    }).sort({ createdAt: -1 })

    const campaignIds = raw.map(c => c._id)
    let playersByCampaignId: Record<string, Array<{ id: string; characterName: string; characterClass: string; avatar: string | null; userId: string }>> = {}

    if (campaignIds.length > 0) {
    const allPlayers = await Player.find(
      { campaignId: { $in: campaignIds } },
      '_id campaignId userId characterName characterClass avatar'
    ).lean()
    playersByCampaignId = allPlayers.reduce((acc, p) => {
      const key = String(p.campaignId)
      if (!acc[key]) acc[key] = []
      acc[key].push({
        id: String(p._id),
        characterName: p.characterName as string,
        characterClass: p.characterClass as string,
        avatar: (p.avatar as string | undefined) ?? null,
        userId: String(p.userId),
      })
      return acc
    }, {} as Record<string, Array<{ id: string; characterName: string; characterClass: string; avatar: string | null; userId: string }>>)
    }

    const userId = String(dbUser._id)
    return raw.map(c => {
      const partyMembers = playersByCampaignId[String(c._id)] ?? []
      const serialized = serializeCampaign(c as Parameters<typeof serializeCampaign>[0], userId, userId, partyMembers)
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

      // Only members can see campaigns; treat gameMasterId as implicit member for legacy campaigns
      const members = c.members ?? []
      const isMember = userId
        ? members.some((m: { userId: unknown }) => String(m.userId) === userId) ||
          (members.length === 0 && c.gameMasterId != null && String(c.gameMasterId) === userId)
        : false
      if (!isMember) return null

      const isOwner = !!userId && c.gameMasterId != null && String(c.gameMasterId) === userId

      const playerDocs = await Player.find(
        { campaignId: c._id },
        '_id campaignId userId characterName characterClass avatar'
      ).lean()
      const partyMembers = playerDocs.map((p: { _id: unknown; characterName: unknown; characterClass: unknown; avatar: unknown; userId: unknown }) => ({
        id: String(p._id),
        characterName: p.characterName as string,
        characterClass: p.characterClass as string,
        avatar: (p.avatar as string | undefined) ?? null,
        userId: String(p.userId),
      }))

      const serialized = serializeCampaign(c as Parameters<typeof serializeCampaign>[0], userId, userId, partyMembers)

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
  links: z.array(z.object({ name: z.string(), url: z.string() })).optional().default([]),
  maxPlayers: z.union([z.string(), z.number()]).optional(),
  // Direct R2 upload path (production): full CDN URL returned by getUploadUrl
  imagePath: z.string().url().optional(),
  // base64 encoded image data (local dev fallback)
  imageData: z
    .string()
    .max(MAX_IMAGE_BASE64_LENGTH, 'Image must be under 3MB after compression')
    .optional(),
  imageMime: z.string().optional(),
  imageName: z.string().optional(),
} as const

function imageFieldsRefinement<
  T extends { imageData?: string; imageMime?: string; imageName?: string; imagePath?: string },
>(data: T): boolean {
  // imagePath (direct upload) and imageData (base64) are mutually exclusive
  if (data.imagePath !== undefined) {
    return (
      data.imageData === undefined &&
      data.imageMime === undefined &&
      data.imageName === undefined
    )
  }
  return (
    (data.imageData === undefined &&
      data.imageMime === undefined &&
      data.imageName === undefined) ||
    (data.imageData !== undefined &&
      data.imageMime !== undefined &&
      data.imageName !== undefined)
  )
}
const imageFieldsMessage = {
  message:
    'imageData, imageMime, and imageName must either all be provided or all be omitted, and cannot be combined with imagePath',
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

      const { name, description, schedFreq, schedDay, schedTime, schedTz, links, maxPlayers, imageData, imageMime, imageName, imagePath: imagePathInput } = data

      if (!name.trim()) throw new Error('Campaign name is required')

      const dbUser = await User.findOne({ providerId: user.id })
      if (!dbUser) throw new Error('User not found')

      let imagePath: string | null = null
      if (imagePathInput) {
        // Direct upload path: validate the URL origin matches our CDN
        const cdnUrl = process.env.CDN_URL
        if (!cdnUrl) throw new Error('Invalid image path')
        try {
          const cdnOrigin = new URL(cdnUrl)
          const imageUrl = new URL(imagePathInput)
          if (imageUrl.origin !== cdnOrigin.origin) throw new Error('Invalid image path')
          if (!imageUrl.pathname.startsWith('/uploads/')) throw new Error('Invalid image path')
        } catch {
          throw new Error('Invalid image path')
        }
        imagePath = imagePathInput
      } else if (imageData && imageMime && imageName) {
        // Local dev fallback: base64 → save via server
        if (imageData.length > MAX_IMAGE_BASE64_LENGTH) {
          throw new Error('Image must be under 3MB after compression')
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
            links: links ?? [],
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

      serverCaptureEvent(user.id, 'campaign_created', {
        campaign_id: String(campaign._id),
        campaign_name: campaign.name as string,
        has_image: imagePath !== null,
        has_schedule: !!(schedFreq || schedDay || schedTime || schedTz),
      })

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

      const { name, description, schedFreq, schedDay, schedTime, schedTz, links, maxPlayers, imageData, imageMime, imageName, imagePath: imagePathInput } = data

      if (!name.trim()) throw new Error('Campaign name is required')

      campaign.name = name.trim()
      campaign.description = description.trim()
      campaign.schedule = {
        frequency: schedFreq ?? null,
        dayOfWeek: schedDay ?? null,
        time: schedTime ?? null,
        timezone: schedTz ?? null,
      }
      campaign.links = links ?? []
      campaign.maxPlayers = parseMaxPlayers(maxPlayers)
      campaign.updatedAt = new Date()

      if (imagePathInput) {
        // Direct upload path: validate the URL origin matches our CDN
        const cdnUrl = process.env.CDN_URL
        if (!cdnUrl) throw new Error('Invalid image path')
        try {
          const cdnOrigin = new URL(cdnUrl)
          const imageUrl = new URL(imagePathInput)
          if (imageUrl.origin !== cdnOrigin.origin) throw new Error('Invalid image path')
          if (!imageUrl.pathname.startsWith('/uploads/')) throw new Error('Invalid image path')
        } catch {
          throw new Error('Invalid image path')
        }
        campaign.imagePath = imagePathInput
      } else if (imageData && imageMime && imageName) {
        // Local dev fallback: base64 → save via server
        if (imageData.length > MAX_IMAGE_BASE64_LENGTH) {
          throw new Error('Image must be under 3MB after compression')
        }
        const buffer = Buffer.from(imageData, 'base64')
        const file = new File([buffer], imageName, { type: imageMime })
        campaign.imagePath = await saveUploadedFile(file, 'uploads/campaigns')
      }

      await campaign.save()
      serverCaptureEvent(user.id, 'campaign_updated', { campaign_id: data.id })
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

      const normalizedInviteCode = data.inviteCode.trim().toUpperCase()
      const campaign = await Campaign.findOne({ inviteCode: normalizedInviteCode })
      if (!campaign) throw new Error('Invalid invite code')
      if (campaign.status !== 'active') throw new Error('Campaign is not active')

      // Treat GM as implicit member (consistent with getCampaign)
      const alreadyMember =
        (campaign.members ?? []).some(
          (m: { userId: unknown }) => String(m.userId) === String(dbUser._id)
        ) || String(campaign.gameMasterId) === String(dbUser._id)
      if (alreadyMember) throw new Error('Already a member of this campaign')

      const now = new Date()

      const updatedCampaign = await Campaign.findOneAndUpdate(
        {
          _id: campaign._id,
          status: 'active',
          'members.userId': { $ne: dbUser._id },
          $expr: {
            $lt: [
              {
                $size: {
                  $filter: {
                    input: { $ifNull: ['$members', []] },
                    as: 'm',
                    cond: { $eq: ['$$m.role', 'player'] },
                  },
                },
              },
              { $ifNull: ['$maxPlayers', 4] },
            ],
          },
        },
        {
          $addToSet: { members: { userId: dbUser._id, role: 'player', joinedAt: now } },
        },
        {
          new: true,
        }
      )

      if (!updatedCampaign) {
        throw new Error('Campaign is full')
      }

      await User.updateOne(
        { _id: dbUser._id },
        {
          $addToSet: { campaigns: { campaignId: updatedCampaign._id, status: 'active', joinedAt: now } },
        }
      )

      // Create placeholder Player document (can be edited later)
      const displayName = [dbUser.firstName as string | undefined, dbUser.lastName as string | undefined]
        .filter(Boolean)
        .join(' ')
        .trim()
      await Player.updateOne(
        {
          campaignId: updatedCampaign._id,
          userId: dbUser._id,
        },
        {
          $setOnInsert: {
            campaignId: updatedCampaign._id,
            userId: dbUser._id,
            characterName: displayName || 'Adventurer',
            characterClass: 'Adventurer',
            joinedAt: now,
          },
        },
        { upsert: true }
      )

      serverCaptureEvent(user.id, 'campaign_joined', { campaign_id: String(updatedCampaign._id) })

      return { success: true, campaignId: String(updatedCampaign._id) }
    } catch (e) {
      serverCaptureException(e, user?.id, { action: 'joinCampaign' })
      throw e
    }
  })
