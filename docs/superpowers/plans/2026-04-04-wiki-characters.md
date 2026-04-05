# Wiki Characters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Characters category to the Wiki Panel with full CRUD, search/filter, image upload with circular crop, drag-to-GM-Screen with character sheet window layout.

**Architecture:** Mirror the Notes system — parallel data layer (model, server functions, hooks), shared wiki UI components (header, filter bar), character-specific components (card, modal, window). Characters use the same drag-and-drop and GM Screen window infrastructure as Notes.

**Tech Stack:** React 19, TypeScript, TanStack Start (server functions), TanStack React Query, MongoDB/Mongoose, Zod, `react-easy-crop` (new dependency), Tailwind CSS, Lucide icons, CodeMirror (MarkdownEditor).

**Spec:** `docs/superpowers/specs/2026-04-04-wiki-characters-design.md`

---

### Task 1: Install react-easy-crop dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

```bash
npm install react-easy-crop
```

- [ ] **Step 2: Verify installation**

```bash
npm ls react-easy-crop
```

Expected: Shows `react-easy-crop@x.x.x` in the dependency tree.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-easy-crop dependency for character image upload"
```

---

### Task 2: Character TypeScript types and Zod schemas

**Files:**
- Create: `app/types/character.ts`
- Create: `app/types/schemas/characters.ts`
- Modify: `app/utils/queryKeys.ts`

- [ ] **Step 1: Create character type definitions**

Create `app/types/character.ts`:

```typescript
export interface PictureCrop {
  x: number
  y: number
  width: number
  height: number
}

export interface CharacterData {
  id: string
  campaignId: string
  createdBy: string
  firstName: string
  lastName: string
  race: string
  characterClass: string
  age: number | null
  location: string
  link: string
  picture: string
  pictureCrop: PictureCrop | null
  notes: string
  gmNotes: string
  tags: string[]
  isPublic: boolean
  sessionId?: string
  sessions: string[]
  createdAt: string
  updatedAt: string
}

export interface CharacterListItem {
  id: string
  campaignId: string
  createdBy: string
  firstName: string
  lastName: string
  race: string
  characterClass: string
  age: number | null
  location: string
  link: string
  picture: string
  pictureCrop: PictureCrop | null
  tags: string[]
  isPublic: boolean
  sessionId?: string
  sessions: string[]
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 2: Create Zod validation schemas**

Create `app/types/schemas/characters.ts`:

```typescript
import { z } from 'zod'

const pictureCropSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})

export const createCharacterSchema = z.object({
  campaignId: z.string().trim().min(1),
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  race: z.string().trim().optional().default(''),
  characterClass: z.string().trim().optional().default(''),
  age: z.number().int().positive().nullable().optional().default(null),
  location: z.string().trim().optional().default(''),
  link: z.string().trim().url().optional().or(z.literal('')).default(''),
  picture: z.string().optional().default(''),
  pictureCrop: pictureCropSchema.nullable().optional().default(null),
  notes: z.string().optional().default(''),
  gmNotes: z.string().optional().default(''),
  tags: z.array(z.string()).optional().default([]),
  isPublic: z.boolean().optional().default(false),
  sessionId: z.string().trim().min(1).optional(),
  sessions: z.array(z.string()).optional().default([]),
})

export const updateCharacterSchema = z.object({
  id: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  race: z.string().trim().optional().default(''),
  characterClass: z.string().trim().optional().default(''),
  age: z.number().int().positive().nullable().optional().default(null),
  location: z.string().trim().optional().default(''),
  link: z.string().trim().url().optional().or(z.literal('')).default(''),
  picture: z.string().optional().default(''),
  pictureCrop: pictureCropSchema.nullable().optional().default(null),
  notes: z.string().optional().default(''),
  gmNotes: z.string().optional().default(''),
  tags: z.array(z.string()).optional().default([]),
  isPublic: z.boolean().optional(),
  sessionId: z.string().trim().min(1).optional(),
  sessions: z.array(z.string()).optional().default([]),
})

export const deleteCharacterSchema = z.object({
  id: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
})

export const listCharactersSchema = z.object({
  campaignId: z.string().min(1),
  sessionId: z.string().optional(),
  search: z.string().optional(),
  visibility: z.enum(['all', 'public', 'private']).optional().default('all'),
  tags: z.array(z.string()).optional(),
})

export const getCharacterSchema = z.object({
  id: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
})
```

- [ ] **Step 3: Add character query keys**

Modify `app/utils/queryKeys.ts` — add a `characters` entry after the `notes` block:

```typescript
characters: {
  all: ['characters'] as const,
  list: (campaignId: string, sessionId?: string, search?: string, visibility?: string, tags?: string[]) =>
    ['characters', 'list', campaignId, sessionId ?? '', search ?? '', visibility ?? 'all', tags ?? []] as const,
  detail: (id: string) => ['characters', 'detail', id] as const,
},
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors related to the new files.

- [ ] **Step 5: Commit**

```bash
git add app/types/character.ts app/types/schemas/characters.ts app/utils/queryKeys.ts
git commit -m "feat(characters): add TypeScript types, Zod schemas, and query keys"
```

---

### Task 3: Character MongoDB model

**Files:**
- Create: `app/server/db/models/Character.ts`

- [ ] **Step 1: Create the Character model**

Create `app/server/db/models/Character.ts`:

```typescript
import mongoose from 'mongoose'
import { normalizeTags } from '~/server/utils/helpers'

const pictureCropSchema = new mongoose.Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  { _id: false },
)

const characterSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  race: { type: String, default: '' },
  characterClass: { type: String, default: '' },
  age: { type: Number, default: null },
  location: { type: String, default: '' },
  link: { type: String, default: '' },
  picture: { type: String, default: '' },
  pictureCrop: { type: pictureCropSchema, default: null },
  notes: { type: String, default: '' },
  gmNotes: { type: String, default: '' },
  tags: { type: [String], default: [] },
  isPublic: { type: Boolean, default: false },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: false },
  sessions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Session' }],
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

characterSchema.pre('save', function () {
  if (this.isModified('tags')) {
    this.tags = normalizeTags(this.tags)
  }
  this.updatedAt = new Date()
})

characterSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate() as unknown
  if (!update) return

  if (Array.isArray(update)) {
    let hasSetStage = false
    update.forEach((stage) => {
      if (!stage || typeof stage !== 'object') return
      const stageObj = stage as Record<string, any>
      if (!('$set' in stageObj)) return
      hasSetStage = true
      const set = stageObj.$set as Record<string, unknown>
      if (Array.isArray(set.tags)) {
        set.tags = normalizeTags(set.tags as string[])
      }
      set.updatedAt = new Date()
    })
    if (!hasSetStage) {
      update.push({ $set: { updatedAt: new Date() } })
    }
    this.setUpdate(update)
    return
  }

  const updateObj = update as Record<string, any>
  if ('$set' in updateObj) {
    const set = (updateObj.$set ??= {})
    if (Array.isArray(set.tags)) {
      set.tags = normalizeTags(set.tags as string[])
    }
    set.updatedAt = new Date()
  } else {
    if (Array.isArray(updateObj.tags)) {
      updateObj.tags = normalizeTags(updateObj.tags as string[])
    }
    updateObj.updatedAt = new Date()
  }
})

// istanbul ignore next
if (typeof (characterSchema as { index?: unknown }).index === 'function') {
  characterSchema.index({ campaignId: 1 })
  characterSchema.index({ campaignId: 1, updatedAt: -1 })
  characterSchema.index({ sessionId: 1 })
  characterSchema.index({ sessions: 1 })
  characterSchema.index({ createdBy: 1 })
  characterSchema.index({ tags: 1 })
  characterSchema.index({ isPublic: 1 })
  characterSchema.index({
    firstName: 'text',
    lastName: 'text',
    race: 'text',
    location: 'text',
    notes: 'text',
    gmNotes: 'text',
  })
}

export const Character = mongoose.models.Character || mongoose.model('Character', characterSchema)
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/server/db/models/Character.ts
git commit -m "feat(characters): add Character MongoDB model with indexes"
```

---

### Task 4: Character server functions

**Files:**
- Create: `app/server/functions/characters.ts`
- Modify: `app/server/functions/gmscreens.ts` (COLLECTION_REGISTRY)
- Modify: `app/types/schemas/gmscreens.ts` (SUPPORTED_COLLECTIONS)

- [ ] **Step 1: Create character server functions**

Create `app/server/functions/characters.ts`. This mirrors `app/server/functions/notes.ts`:

```typescript
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
import type { CharacterData, CharacterListItem } from '~/types/character'
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
  pictureCrop?: { x: number; y: number; width: number; height: number } | null
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
    pictureCrop: c.pictureCrop ?? null,
    notes: c.notes ?? '',
    gmNotes: c.gmNotes ?? '',
    tags: c.tags ?? [],
    isPublic: c.isPublic ?? false,
    sessionId: c.sessionId ? String(c.sessionId) : undefined,
    sessions: (c.sessions ?? []).map(String),
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
  pictureCrop?: { x: number; y: number; width: number; height: number } | null
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
    pictureCrop: c.pictureCrop ?? null,
    tags: c.tags ?? [],
    isPublic: c.isPublic ?? false,
    sessionId: c.sessionId ? String(c.sessionId) : undefined,
    sessions: (c.sessions ?? []).map(String),
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : '',
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : '',
  }
}

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
  const members = campaign.members ?? []
  const isGM =
    String(campaign.gameMasterId) === userId ||
    members.some((m: { userId: unknown; role?: string }) => String(m.userId) === userId && m.role === 'gm')
  const isMember = isGM || members.some((m: { userId: unknown }) => String(m.userId) === userId)
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
        notes: data.notes ?? '',
        gmNotes: data.gmNotes ?? '',
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
      existing.firstName = data.firstName.trim()
      existing.lastName = data.lastName.trim()
      existing.race = (data.race ?? '').trim()
      existing.characterClass = (data.characterClass ?? '').trim()
      existing.age = data.age ?? null
      existing.location = (data.location ?? '').trim()
      existing.link = (data.link ?? '').trim()
      existing.picture = data.picture ?? ''
      existing.pictureCrop = data.pictureCrop ?? null
      existing.notes = data.notes ?? ''
      existing.gmNotes = data.gmNotes ?? ''
      existing.tags = finalTags
      existing.sessions = data.sessions ?? []
      existing.sessionId = data.sessionId && data.sessionId !== '__none__' ? data.sessionId : undefined
      if (data.isPublic !== undefined) {
        existing.isPublic = data.isPublic
      }
      existing.updatedAt = new Date()
      await existing.save()

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

      const filter: Record<string, unknown> = { campaignId: data.campaignId }

      // Session filter: union of sessionId (introduced) OR sessions (appeared)
      if (data.sessionId === '__none__') {
        filter.$and = [
          { sessionId: { $exists: false } },
          { sessions: { $size: 0 } },
        ]
      } else if (data.sessionId) {
        filter.$or = [
          { sessionId: data.sessionId },
          { sessions: data.sessionId },
        ]
      }

      if (data.visibility === 'public') {
        filter.isPublic = true
      } else if (data.visibility === 'private') {
        filter.isPublic = false
        filter.createdBy = userId
      } else {
        // visibility='all': only characters the user is allowed to see
        const visOr = [{ isPublic: true }, { createdBy: userId }]
        if (filter.$or) {
          // Session $or already exists, combine with $and
          const sessionOr = filter.$or
          delete filter.$or
          filter.$and = [
            { $or: sessionOr as Record<string, unknown>[] },
            { $or: visOr },
          ]
        } else if (filter.$and) {
          (filter.$and as Record<string, unknown>[]).push({ $or: visOr })
        } else {
          filter.$or = visOr
        }
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
        pictureCrop?: { x: number; y: number; width: number; height: number } | null
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

      // Private characters only visible to creator
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
```

- [ ] **Step 2: Register 'character' in COLLECTION_REGISTRY**

Modify `app/server/functions/gmscreens.ts`. Add import at top with other model imports:

```typescript
import { Character } from '../db/models/Character'
```

Add to `COLLECTION_REGISTRY` object (after the `note` entry, around line 119):

```typescript
character: {
  async fetch(ids: string[], campaignId: string) {
    return Character.find({ _id: { $in: ids }, campaignId }, '_id firstName lastName notes').lean().then(docs =>
      docs.map(d => ({
        _id: d._id,
        title: `${(d as { firstName?: string }).firstName ?? ''} ${(d as { lastName?: string }).lastName ?? ''}`.trim(),
        content: (d as { notes?: string }).notes,
      }))
    ) as Promise<Array<{ _id: unknown; title?: string; content?: string }>>
  },
},
```

- [ ] **Step 3: Add 'character' to SUPPORTED_COLLECTIONS**

Modify `app/types/schemas/gmscreens.ts`, line 8:

Change:
```typescript
export const SUPPORTED_COLLECTIONS: [string, ...string[]] = ['note']
```

To:
```typescript
export const SUPPORTED_COLLECTIONS: [string, ...string[]] = ['note', 'character']
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add app/server/functions/characters.ts app/server/functions/gmscreens.ts app/server/db/models/Character.ts app/types/schemas/gmscreens.ts
git commit -m "feat(characters): add server functions, COLLECTION_REGISTRY entry, and SUPPORTED_COLLECTIONS"
```

---

### Task 5: Character React Query hooks

**Files:**
- Create: `app/hooks/useCharacters.ts`

- [ ] **Step 1: Create the hooks file**

Create `app/hooks/useCharacters.ts`:

```typescript
import { createServerFn } from '@tanstack/react-start'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CharacterData, CharacterListItem } from '~/types/character'
import { captureException } from '~/providers/PostHogProvider'
import { queryKeys } from '~/utils/queryKeys'
import {
  listCharactersSchema,
  getCharacterSchema,
  createCharacterSchema,
  updateCharacterSchema,
  deleteCharacterSchema,
} from '~/types/schemas/characters'

// ---------------------------------------------------------------------------
// Server function wrappers — dynamic imports keep Mongoose server-only.
// ---------------------------------------------------------------------------

const listCharactersFn = createServerFn({ method: 'GET' })
  .inputValidator(listCharactersSchema)
  .handler(async ({ data }) => {
    const { listCharacters } = await import('~/server/functions/characters')
    return listCharacters({ data })
  })

const getCharacterFn = createServerFn({ method: 'GET' })
  .inputValidator(getCharacterSchema)
  .handler(async ({ data }) => {
    const { getCharacter } = await import('~/server/functions/characters')
    return getCharacter({ data })
  })

const createCharacterFn = createServerFn({ method: 'POST' })
  .inputValidator(createCharacterSchema)
  .handler(async ({ data }) => {
    const { createCharacter } = await import('~/server/functions/characters')
    return createCharacter({ data })
  })

const updateCharacterFn = createServerFn({ method: 'POST' })
  .inputValidator(updateCharacterSchema)
  .handler(async ({ data }) => {
    const { updateCharacter } = await import('~/server/functions/characters')
    return updateCharacter({ data })
  })

const deleteCharacterFn = createServerFn({ method: 'POST' })
  .inputValidator(deleteCharacterSchema)
  .handler(async ({ data }) => {
    const { deleteCharacter } = await import('~/server/functions/characters')
    return deleteCharacter({ data })
  })

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

interface ListCharactersFilters {
  sessionId?: string
  search?: string
  visibility?: 'all' | 'public' | 'private'
  tags?: string[]
}

export function useCharacters(campaignId: string, filters?: ListCharactersFilters) {
  const sessionId = filters?.sessionId
  const search = filters?.search
  const visibility = filters?.visibility
  const tags = filters?.tags

  const { data: characters = [], isLoading, error } = useQuery({
    queryKey: queryKeys.characters.list(campaignId, sessionId, search, visibility, tags),
    queryFn: () =>
      listCharactersFn({
        data: {
          campaignId,
          sessionId,
          search,
          visibility,
          tags,
        },
      }),
    enabled: !!campaignId,
  })

  return {
    characters: characters as CharacterListItem[],
    isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
  }
}

export function useCharacter(id: string, campaignId: string) {
  const { data: character = null, isLoading, error } = useQuery({
    queryKey: queryKeys.characters.detail(id),
    queryFn: () => getCharacterFn({ data: { id, campaignId } }),
    enabled: !!id && !!campaignId,
  })

  return {
    character: character as CharacterData | null,
    isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
  }
}

interface CreateCharacterInput {
  campaignId: string
  firstName: string
  lastName: string
  race?: string
  characterClass?: string
  age?: number | null
  location?: string
  link?: string
  picture?: string
  pictureCrop?: { x: number; y: number; width: number; height: number } | null
  notes?: string
  gmNotes?: string
  tags?: string[]
  isPublic?: boolean
  sessionId?: string
  sessions?: string[]
}

export function useCreateCharacter() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async (input: CreateCharacterInput) =>
      createCharacterFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characters.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.tags.all })
    },
    onError: (e) => {
      captureException(e, { action: 'createCharacter' })
    },
  })

  const create = async (input: CreateCharacterInput) => {
    try {
      return await mutation.mutateAsync(input)
    } catch {
      return null
    }
  }

  return {
    create,
    isLoading: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : mutation.error ? String(mutation.error) : null,
  }
}

interface UpdateCharacterInput {
  id: string
  campaignId: string
  firstName: string
  lastName: string
  race?: string
  characterClass?: string
  age?: number | null
  location?: string
  link?: string
  picture?: string
  pictureCrop?: { x: number; y: number; width: number; height: number } | null
  notes?: string
  gmNotes?: string
  tags?: string[]
  isPublic?: boolean
  sessionId?: string
  sessions?: string[]
}

export function useUpdateCharacter() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async (input: UpdateCharacterInput) =>
      updateCharacterFn({ data: input }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characters.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.characters.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.tags.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.gmscreens.all })
    },
    onError: (e, variables) => {
      captureException(e, { action: 'updateCharacter', characterId: variables.id })
    },
  })

  const update = async (input: UpdateCharacterInput) => {
    try {
      return await mutation.mutateAsync(input)
    } catch {
      return null
    }
  }

  return {
    update,
    isLoading: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : mutation.error ? String(mutation.error) : null,
  }
}

interface DeleteCharacterInput {
  id: string
  campaignId: string
}

export function useDeleteCharacter() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async (input: DeleteCharacterInput) =>
      deleteCharacterFn({ data: input }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characters.all })
      queryClient.removeQueries({ queryKey: queryKeys.characters.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.gmscreens.all })
    },
    onError: (e, variables) => {
      captureException(e, { action: 'deleteCharacter', characterId: variables.id })
    },
  })

  const remove = async (input: DeleteCharacterInput) => {
    try {
      return await mutation.mutateAsync(input)
    } catch {
      return null
    }
  }

  return {
    remove,
    isLoading: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : mutation.error ? String(mutation.error) : null,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/hooks/useCharacters.ts
git commit -m "feat(characters): add React Query hooks for character CRUD"
```

---

### Task 6: Shared wiki components (WikiCategoryHeader + WikiFilterBar)

**Files:**
- Create: `app/components/wiki/shared/WikiCategoryHeader.tsx`
- Create: `app/components/wiki/shared/WikiFilterBar.tsx`

- [ ] **Step 1: Create WikiCategoryHeader**

Create `app/components/wiki/shared/WikiCategoryHeader.tsx`:

```typescript
import { ChevronLeft } from 'lucide-react'

interface WikiCategoryHeaderProps {
  title: string
  onBack: () => void
}

export function WikiCategoryHeader({ title, onBack }: WikiCategoryHeaderProps) {
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={onBack}
      className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3 font-sans font-semibold text-xs text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white w-full"
    >
      <ChevronLeft className="h-4 w-4" />
      <span>{title}</span>
    </button>
  )
}
```

- [ ] **Step 2: Create WikiFilterBar**

Create `app/components/wiki/shared/WikiFilterBar.tsx`:

```typescript
import { Plus, Search } from 'lucide-react'
import type { CampaignData } from '~/types/campaign'
import { TagAutocompleteInput } from '~/components/shared/TagAutocompleteInput'

interface WikiFilterBarProps {
  search: string
  onSearchChange: (value: string) => void
  sessionId: string
  onSessionChange: (value: string) => void
  visibility: 'all' | 'public' | 'private'
  onVisibilityChange: (value: 'all' | 'public' | 'private') => void
  sessions: CampaignData['sessions']
  onCreateClick: () => void
  campaignId: string
  filterTags: string[]
  onFilterTagsChange: (tags: string[]) => void
  searchPlaceholder?: string
}

export function WikiFilterBar({
  search,
  onSearchChange,
  sessionId,
  onSessionChange,
  visibility,
  onVisibilityChange,
  sessions,
  onCreateClick,
  campaignId,
  filterTags,
  onFilterTagsChange,
  searchPlaceholder = 'Search...',
}: WikiFilterBarProps) {
  return (
    <div className="flex flex-col gap-3 p-3 border-b border-white/[0.07] bg-[#0D1117]">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-[#080A12] border border-white/[0.07] rounded px-9 py-2 font-sans font-semibold text-xs text-white outline-none focus:border-blue-500/50 transition-colors placeholder:text-slate-600"
          />
        </div>
        <button
          type="button"
          onClick={onCreateClick}
          className="flex items-center justify-center h-8 w-8 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          aria-label="Create new item"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <TagAutocompleteInput
        campaignId={campaignId}
        selectedTags={filterTags}
        onTagsChange={onFilterTagsChange}
        placeholder="Filter by tags..."
      />

      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="wiki-session-filter" className="sr-only">Filter by session</label>
          <select
            id="wiki-session-filter"
            value={sessionId}
            onChange={(e) => onSessionChange(e.target.value)}
            className="w-full bg-[#080A12] border border-white/[0.07] rounded px-2 py-1.5 font-sans font-semibold text-[11px] text-slate-300 outline-none focus:border-blue-500/50 transition-colors"
          >
            <option value="">All Sessions</option>
            <option value="__none__">No Session</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                Session {session.number}: {session.name}
              </option>
            ))}
          </select>
        </div>

        <div className="w-32">
          <label htmlFor="wiki-visibility-filter" className="sr-only">Filter by visibility</label>
          <select
            id="wiki-visibility-filter"
            value={visibility}
            onChange={(e) => onVisibilityChange(e.target.value as 'all' | 'public' | 'private')}
            className="w-full bg-[#080A12] border border-white/[0.07] rounded px-2 py-1.5 font-sans font-semibold text-[11px] text-slate-300 outline-none focus:border-blue-500/50 transition-colors"
          >
            <option value="all">All</option>
            <option value="public">Public Only</option>
            <option value="private">Private Only</option>
          </select>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/components/wiki/shared/WikiCategoryHeader.tsx app/components/wiki/shared/WikiFilterBar.tsx
git commit -m "feat(wiki): add shared WikiCategoryHeader and WikiFilterBar components"
```

---

### Task 7: Move and refactor WikiPanel

**Files:**
- Move: `app/components/mainview/WikiPanel.tsx` → `app/components/wiki/WikiPanel.tsx`
- Modify: `app/components/mainview/InspectorSidebar.tsx` (update import)

- [ ] **Step 1: Create the new WikiPanel**

Create `app/components/wiki/WikiPanel.tsx` (stripped to Characters only, delegates to CharactersPanel when selected):

```typescript
import React, { useState } from 'react'
import { Users } from 'lucide-react'
import { CharactersPanel } from './characters/CharactersPanel'

type WikiCategoryId = 'characters'

interface WikiCategory {
  id: WikiCategoryId
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const WIKI_CATEGORIES: WikiCategory[] = [
  { id: 'characters', label: 'Characters', icon: Users },
]

export function WikiPanel() {
  const [selectedCategory, setSelectedCategory] = useState<WikiCategoryId | null>(null)

  return (
    <div className="h-full flex flex-col bg-[#080A12] w-full">
      {selectedCategory === null ? (
        <div className="flex-1 overflow-y-auto">
          {WIKI_CATEGORIES.map((category, index) => {
            const Icon = category.icon
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategory(category.id)}
                className={[
                  'flex w-full items-center px-4 py-3 text-left transition-colors hover:bg-white/[0.05]',
                  index < WIKI_CATEGORIES.length - 1 ? 'border-b border-white/[0.07]' : '',
                ].join(' ')}
              >
                <Icon className="mr-3 h-4 w-4 shrink-0 text-slate-400" />
                <span className="font-sans font-semibold text-xs text-slate-300">
                  {category.label}
                </span>
              </button>
            )
          })}
        </div>
      ) : selectedCategory === 'characters' ? (
        <CharactersPanel onBack={() => setSelectedCategory(null)} />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 2: Delete the old WikiPanel**

```bash
rm app/components/mainview/WikiPanel.tsx
```

- [ ] **Step 3: Update the import in InspectorSidebar.tsx**

In `app/components/mainview/InspectorSidebar.tsx`, change:

```typescript
import { WikiPanel } from './WikiPanel'
```

To:

```typescript
import { WikiPanel } from '~/components/wiki/WikiPanel'
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: Errors about missing `CharactersPanel` — that's expected and will be fixed in Task 8. If you prefer, create a stub `CharactersPanel` now:

Create `app/components/wiki/characters/CharactersPanel.tsx`:

```typescript
interface CharactersPanelProps {
  onBack: () => void
}

export function CharactersPanel({ onBack }: CharactersPanelProps) {
  return <div>Characters panel placeholder</div>
}
```

- [ ] **Step 5: Commit**

```bash
git add app/components/wiki/WikiPanel.tsx app/components/mainview/InspectorSidebar.tsx app/components/wiki/characters/CharactersPanel.tsx
git rm app/components/mainview/WikiPanel.tsx
git commit -m "refactor(wiki): move WikiPanel to wiki/ folder, strip to Characters only"
```

---

### Task 8: CharacterCard component

**Files:**
- Create: `app/components/wiki/characters/CharacterCard.tsx`

- [ ] **Step 1: Create the CharacterCard component**

Create `app/components/wiki/characters/CharacterCard.tsx`:

```typescript
import { Globe, Lock, ExternalLink } from 'lucide-react'
import type { CharacterListItem } from '~/types/character'

interface CharacterCardProps {
  character: CharacterListItem
  onClick: (character: CharacterListItem) => void
}

/**
 * Deterministic gradient pairs based on name hash.
 */
const GRADIENT_PAIRS = [
  ['#3b82f6', '#8b5cf6'],
  ['#f59e0b', '#ef4444'],
  ['#10b981', '#06b6d4'],
  ['#ec4899', '#8b5cf6'],
  ['#f97316', '#eab308'],
  ['#14b8a6', '#3b82f6'],
]

function hashName(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function getInitials(firstName: string, lastName: string): string {
  const f = firstName.charAt(0).toUpperCase()
  const l = lastName.charAt(0).toUpperCase()
  return l ? `${f}${l}` : f
}

export function CharacterCard({ character, onClick }: CharacterCardProps) {
  const fullName = `${character.firstName} ${character.lastName}`.trim()
  const initials = getInitials(character.firstName, character.lastName)
  const gradientIndex = hashName(fullName) % GRADIENT_PAIRS.length
  const [gradFrom, gradTo] = GRADIENT_PAIRS[gradientIndex]

  const infoSegments: string[] = []
  if (character.race) infoSegments.push(character.race)
  if (character.age != null) infoSegments.push(`Age ${character.age}`)
  if (character.location) infoSegments.push(character.location)

  return (
    <div
      role="button"
      tabIndex={0}
      draggable="true"
      onDragStart={(e) => {
        e.dataTransfer.setData(
          'application/x-cartyx-document',
          JSON.stringify({
            collection: 'character',
            documentId: character.id,
            title: fullName,
          }),
        )
        e.dataTransfer.effectAllowed = 'copy'
        e.currentTarget.style.opacity = '0.4'
      }}
      onDragEnd={(e) => {
        e.currentTarget.style.opacity = ''
      }}
      onClick={() => onClick(character)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(character)
        }
      }}
      className="flex items-start gap-3 px-4 py-3 border-b border-white/[0.05] hover:bg-white/[0.03] transition-colors group cursor-grab active:cursor-grabbing"
    >
      {/* Avatar */}
      <div
        className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden mt-0.5"
        style={
          character.picture
            ? undefined
            : { background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})` }
        }
      >
        {character.picture ? (
          <img
            src={character.picture}
            alt={fullName}
            className="w-full h-full object-cover"
            style={
              character.pictureCrop
                ? {
                    objectPosition: `${character.pictureCrop.x * 100}% ${character.pictureCrop.y * 100}%`,
                  }
                : undefined
            }
          />
        ) : (
          <span className="text-lg text-white font-semibold">{initials}</span>
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-slate-200 group-hover:text-blue-400 transition-colors truncate">
            {fullName}
          </span>
          {character.isPublic ? (
            <Globe className="h-3.5 w-3.5 text-emerald-500 shrink-0" aria-label="Public" />
          ) : (
            <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0" aria-label="Private" />
          )}
          {character.link && (
            <a
              href={character.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="shrink-0"
              aria-label="External link"
            >
              <ExternalLink className="h-3 w-3 text-slate-500 hover:text-blue-400 transition-colors" />
            </a>
          )}
        </div>

        {infoSegments.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5">
            {infoSegments.map((segment, i) => (
              <span key={segment} className="flex items-center gap-1.5">
                {i > 0 && <span className="opacity-40">&middot;</span>}
                <span>{segment}</span>
              </span>
            ))}
          </div>
        )}

        {character.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {character.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-sans font-bold text-[9px] tracking-tight"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/components/wiki/characters/CharacterCard.tsx
git commit -m "feat(characters): add CharacterCard component with avatar, drag-and-drop"
```

---

### Task 9: ImageCropInput component

**Files:**
- Create: `app/components/wiki/characters/ImageCropInput.tsx`

- [ ] **Step 1: Create the ImageCropInput component**

Create `app/components/wiki/characters/ImageCropInput.tsx`:

```typescript
import { useState, useCallback, useRef } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import { Camera, X } from 'lucide-react'

interface ImageCropInputProps {
  imageUrl: string
  crop: { x: number; y: number; width: number; height: number } | null
  onImageChange: (url: string) => void
  onCropChange: (crop: { x: number; y: number; width: number; height: number } | null) => void
  onUpload: (file: File) => Promise<string>
  disabled?: boolean
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function ImageCropInput({
  imageUrl,
  crop: savedCrop,
  onImageChange,
  onCropChange,
  onUpload,
  disabled,
}: ImageCropInputProps) {
  const [isCropping, setIsCropping] = useState(false)
  const [cropImageSrc, setCropImageSrc] = useState<string>('')
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    const file = e.target.files?.[0]
    if (!file) return

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Only JPG, PNG, and WebP images are accepted.')
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setError('Image must be under 5MB.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setCropImageSrc(reader.result as string)
      setCropPosition({ x: 0, y: 0 })
      setZoom(1)
      setIsCropping(true)
    }
    reader.readAsDataURL(file)
  }, [])

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleConfirmCrop = useCallback(async () => {
    if (!croppedAreaPixels || !fileInputRef.current?.files?.[0]) return

    setIsUploading(true)
    setError(null)
    try {
      const file = fileInputRef.current.files[0]
      const publicUrl = await onUpload(file)

      // Create an image to get natural dimensions for normalization
      const img = new Image()
      img.src = cropImageSrc
      await new Promise((resolve) => { img.onload = resolve })

      const normalizedCrop = {
        x: croppedAreaPixels.x / img.naturalWidth,
        y: croppedAreaPixels.y / img.naturalHeight,
        width: croppedAreaPixels.width / img.naturalWidth,
        height: croppedAreaPixels.height / img.naturalHeight,
      }

      onImageChange(publicUrl)
      onCropChange(normalizedCrop)
      setIsCropping(false)
      setCropImageSrc('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }, [croppedAreaPixels, cropImageSrc, onUpload, onImageChange, onCropChange])

  const handleCancelCrop = useCallback(() => {
    setIsCropping(false)
    setCropImageSrc('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleRemoveImage = useCallback(() => {
    onImageChange('')
    onCropChange(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [onImageChange, onCropChange])

  if (isCropping) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-64 h-64 bg-black rounded-lg overflow-hidden">
          <Cropper
            image={cropImageSrc}
            crop={cropPosition}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            onCropChange={setCropPosition}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <p className="text-[10px] text-slate-500 font-sans">
          Drag to position, scroll to zoom
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCancelCrop}
            disabled={isUploading}
            className="px-4 py-1.5 rounded text-xs font-semibold text-slate-300 border border-white/[0.07] hover:bg-white/[0.05] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmCrop}
            disabled={isUploading}
            className="px-4 py-1.5 rounded text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            {isUploading ? 'Uploading...' : 'Confirm'}
          </button>
        </div>
        {error && <p className="text-xs text-rose-400">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {imageUrl ? (
        <div className="relative">
          <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-white/10">
            <img
              src={imageUrl}
              alt="Character"
              className="w-full h-full object-cover"
              style={
                savedCrop
                  ? {
                      objectPosition: `${savedCrop.x * 100}% ${savedCrop.y * 100}%`,
                    }
                  : undefined
              }
            />
          </div>
          <button
            type="button"
            onClick={handleRemoveImage}
            disabled={disabled}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-600 flex items-center justify-center hover:bg-rose-500 transition-colors"
            aria-label="Remove image"
          >
            <X className="h-3 w-3 text-white" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="w-24 h-24 rounded-full border-2 border-dashed border-white/[0.15] flex flex-col items-center justify-center gap-1 hover:border-blue-500/50 transition-colors cursor-pointer disabled:opacity-50"
        >
          <Camera className="h-5 w-5 text-slate-500" />
          <span className="text-[9px] text-slate-500 font-semibold">Upload</span>
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        onChange={handleFileSelect}
        className="hidden"
      />

      {!imageUrl && (
        <p className="text-[10px] text-slate-600 text-center font-sans">
          Recommended: 512×512px or larger. Max 5MB.
          <br />
          JPG, PNG, or WebP.
        </p>
      )}

      {imageUrl && !isCropping && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold transition-colors"
        >
          Change image
        </button>
      )}

      {error && !isCropping && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/components/wiki/characters/ImageCropInput.tsx
git commit -m "feat(characters): add ImageCropInput with react-easy-crop circular crop"
```

---

### Task 10: CharacterModal component

**Files:**
- Create: `app/components/wiki/characters/CharacterModal.tsx`

This is a large component. It mirrors `app/components/mainview/notes/NoteModal.tsx` but with more fields.

- [ ] **Step 1: Create CharacterModal**

Create `app/components/wiki/characters/CharacterModal.tsx`:

```typescript
import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { FormInput } from '~/components/FormInput'
import { FormSelect } from '~/components/FormSelect'
import { MarkdownEditor } from '~/components/shared/MarkdownEditor'
import { TagAutocompleteInput } from '~/components/shared/TagAutocompleteInput'
import { ImageCropInput } from './ImageCropInput'
import { useCharacter, useCreateCharacter, useUpdateCharacter, useDeleteCharacter } from '~/hooks/useCharacters'
import type { CampaignData } from '~/types/campaign'
import type { PictureCrop } from '~/types/character'
import { getUploadUrl } from '~/server/functions/uploads'

interface CharacterModalProps {
  isOpen: boolean
  onClose: () => void
  campaignId: string
  characterId?: string
  sessions: CampaignData['sessions']
}

interface FieldErrors {
  firstName?: string
  lastName?: string
  link?: string
}

export function CharacterModal({
  isOpen,
  onClose,
  campaignId,
  characterId,
  sessions,
}: CharacterModalProps) {
  const isEdit = !!characterId

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [race, setRace] = useState('')
  const [characterClass, setCharacterClass] = useState('')
  const [age, setAge] = useState('')
  const [location, setLocation] = useState('')
  const [link, setLink] = useState('')
  const [picture, setPicture] = useState('')
  const [pictureCrop, setPictureCrop] = useState<PictureCrop | null>(null)
  const [sessionId, setSessionId] = useState('')
  const [selectedSessions, setSelectedSessions] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [gmNotes, setGmNotes] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [isPublic, setIsPublic] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const { character: existingCharacter, isLoading: isFetchingCharacter } = useCharacter(
    characterId ?? '',
    campaignId,
  )
  const { create, isLoading: isCreating } = useCreateCharacter()
  const { update, isLoading: isUpdating } = useUpdateCharacter()
  const { remove, isLoading: isDeleting } = useDeleteCharacter()

  // Populate form in edit mode
  useEffect(() => {
    if (isEdit && existingCharacter) {
      setFirstName(existingCharacter.firstName)
      setLastName(existingCharacter.lastName)
      setRace(existingCharacter.race)
      setCharacterClass(existingCharacter.characterClass)
      setAge(existingCharacter.age != null ? String(existingCharacter.age) : '')
      setLocation(existingCharacter.location)
      setLink(existingCharacter.link)
      setPicture(existingCharacter.picture)
      setPictureCrop(existingCharacter.pictureCrop)
      setSessionId(existingCharacter.sessionId ?? '')
      setSelectedSessions(existingCharacter.sessions)
      setNotes(existingCharacter.notes)
      setGmNotes(existingCharacter.gmNotes)
      setTags(existingCharacter.tags)
      setIsPublic(existingCharacter.isPublic)
    }
  }, [isEdit, existingCharacter])

  // Reset form when opening in create mode
  useEffect(() => {
    if (isOpen && !isEdit) {
      setFirstName('')
      setLastName('')
      setRace('')
      setCharacterClass('')
      setAge('')
      setLocation('')
      setLink('')
      setPicture('')
      setPictureCrop(null)
      setSessionId('')
      setSelectedSessions([])
      setNotes('')
      setGmNotes('')
      setTags([])
      setIsPublic(false)
      setError(null)
      setFieldErrors({})
      setHasSubmitted(false)
      setShowDeleteConfirm(false)
    }
  }, [isOpen, isEdit])

  const validate = useCallback((): FieldErrors => {
    const errors: FieldErrors = {}
    if (!firstName.trim()) errors.firstName = 'First name is required'
    if (!lastName.trim()) errors.lastName = 'Last name is required'
    if (link.trim() && !/^https?:\/\/.+/.test(link.trim())) {
      errors.link = 'Must be a valid HTTP or HTTPS URL'
    }
    return errors
  }, [firstName, lastName, link])

  useEffect(() => {
    if (hasSubmitted) setFieldErrors(validate())
  }, [hasSubmitted, validate])

  const handleUpload = useCallback(async (file: File): Promise<string> => {
    const result = await getUploadUrl({
      data: { contentType: file.type, subdir: 'uploads/characters' },
    })
    await fetch(result.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    })
    return result.publicUrl
  }, [])

  const handleSubmit = useCallback(async () => {
    setHasSubmitted(true)
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setError(null)
    const parsedAge = age.trim() ? parseInt(age, 10) : null

    if (isEdit && characterId) {
      const result = await update({
        id: characterId,
        campaignId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        race: race.trim(),
        characterClass: characterClass.trim(),
        age: parsedAge,
        location: location.trim(),
        link: link.trim(),
        picture,
        pictureCrop,
        sessionId: sessionId || undefined,
        sessions: selectedSessions,
        notes,
        gmNotes,
        tags,
        isPublic,
      })
      if (result) onClose()
      else setError('Failed to update character')
    } else {
      const result = await create({
        campaignId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        race: race.trim(),
        characterClass: characterClass.trim(),
        age: parsedAge,
        location: location.trim(),
        link: link.trim(),
        picture,
        pictureCrop,
        sessionId: sessionId || undefined,
        sessions: selectedSessions,
        notes,
        gmNotes,
        tags,
        isPublic,
      })
      if (result) onClose()
      else setError('Failed to create character')
    }
  }, [
    validate, isEdit, characterId, campaignId, firstName, lastName, race,
    characterClass, age, location, link, picture, pictureCrop, sessionId,
    selectedSessions, notes, gmNotes, tags, isPublic, create, update, onClose,
  ])

  const handleDelete = useCallback(async () => {
    if (!characterId) return
    const result = await remove({ id: characterId, campaignId })
    if (result) onClose()
    else setError('Failed to delete character')
  }, [characterId, campaignId, remove, onClose])

  const handleSessionToggle = useCallback((sessId: string) => {
    setSelectedSessions((prev) =>
      prev.includes(sessId)
        ? prev.filter((s) => s !== sessId)
        : [...prev, sessId],
    )
  }, [])

  if (!isOpen) return null

  const isLoading = isCreating || isUpdating || isDeleting

  const sessionOptions = [
    { value: '', label: 'No Session' },
    ...sessions.map((s) => ({ value: s.id, label: `Session ${s.number}: ${s.name}` })),
  ]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="relative flex h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-white/[0.07] bg-[#0D1117] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4">
          <h2 className="font-sans text-lg font-bold text-white">
            {isEdit ? 'Edit Character' : 'New Character'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {isFetchingCharacter && isEdit ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-xs text-slate-500 animate-pulse">Loading character...</p>
            </div>
          ) : (
            <>
              {/* Picture upload */}
              <ImageCropInput
                imageUrl={picture}
                crop={pictureCrop}
                onImageChange={setPicture}
                onCropChange={setPictureCrop}
                onUpload={handleUpload}
                disabled={isLoading}
              />

              <div className="grid grid-cols-2 gap-3">
                <FormInput
                  label="First Name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  error={fieldErrors.firstName}
                  required
                  disabled={isLoading}
                  placeholder="First name"
                />
                <FormInput
                  label="Last Name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  error={fieldErrors.lastName}
                  required
                  disabled={isLoading}
                  placeholder="Last name"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormInput
                  label="Race"
                  value={race}
                  onChange={(e) => setRace(e.target.value)}
                  disabled={isLoading}
                  placeholder="e.g. Half-Elf"
                />
                <FormInput
                  label="Class"
                  value={characterClass}
                  onChange={(e) => setCharacterClass(e.target.value)}
                  disabled={isLoading}
                  placeholder="e.g. Ranger / Druid"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormInput
                  label="Age"
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  disabled={isLoading}
                  placeholder="Age"
                />
                <FormInput
                  label="Location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={isLoading}
                  placeholder="Current residence"
                />
              </div>

              <FormInput
                label="Link"
                type="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                error={fieldErrors.link}
                disabled={isLoading}
                placeholder="https://..."
              />

              <FormSelect
                label="Session Introduced"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                options={sessionOptions}
                disabled={isLoading}
              />

              {/* Sessions Appeared In — chip multi-select */}
              <div>
                <label className="block font-sans text-xs font-semibold text-slate-300 mb-1.5">
                  Sessions Appeared In
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedSessions.map((sessId) => {
                    const sess = sessions.find((s) => s.id === sessId)
                    return (
                      <span
                        key={sessId}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-semibold"
                      >
                        {sess ? `S${sess.number}` : sessId}
                        <button
                          type="button"
                          onClick={() => handleSessionToggle(sessId)}
                          className="hover:text-white transition-colors"
                          aria-label={`Remove session ${sess?.number}`}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    )
                  })}
                </div>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) handleSessionToggle(e.target.value)
                  }}
                  disabled={isLoading}
                  className="w-full bg-[#080A12] border border-white/[0.07] rounded px-2 py-1.5 font-sans font-semibold text-[11px] text-slate-300 outline-none focus:border-blue-500/50 transition-colors"
                >
                  <option value="">Add session...</option>
                  {sessions
                    .filter((s) => !selectedSessions.includes(s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        Session {s.number}: {s.name}
                      </option>
                    ))}
                </select>
              </div>

              <MarkdownEditor
                label="Notes"
                value={notes}
                onChange={setNotes}
                placeholder="Public details about this character..."
                disabled={isLoading}
                minHeight="120px"
              />

              <MarkdownEditor
                label={
                  <span>
                    GM Notes{' '}
                    <span className="text-amber-500 text-[10px] font-normal">(only visible to GM)</span>
                  </span>
                }
                value={gmNotes}
                onChange={setGmNotes}
                placeholder="Secret GM-only notes..."
                disabled={isLoading}
                minHeight="120px"
              />

              <TagAutocompleteInput
                campaignId={campaignId}
                selectedTags={tags}
                onTagsChange={setTags}
                placeholder="Add tags..."
                disabled={isLoading}
              />

              {/* Visibility */}
              <fieldset>
                <legend className="font-sans text-xs font-semibold text-slate-300 mb-2">Visibility</legend>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      checked={!isPublic}
                      onChange={() => setIsPublic(false)}
                      disabled={isLoading}
                      className="accent-blue-500"
                    />
                    <span className="text-xs text-slate-300 font-semibold">Private</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      checked={isPublic}
                      onChange={() => setIsPublic(true)}
                      disabled={isLoading}
                      className="accent-blue-500"
                    />
                    <span className="text-xs text-slate-300 font-semibold">Public</span>
                  </label>
                </div>
              </fieldset>

              {error && (
                <p className="text-xs text-rose-400 font-semibold">{error}</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/[0.07] px-6 py-4">
          <div>
            {isEdit && (
              showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-rose-400">Delete this character?</span>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isLoading}
                    className="px-3 py-1 rounded text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors disabled:opacity-50"
                  >
                    Yes, delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isLoading}
                    className="px-3 py-1 rounded text-xs font-semibold text-slate-300 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isLoading}
                  className="px-3 py-1 rounded text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors disabled:opacity-50"
                >
                  Delete
                </button>
              )
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 rounded text-xs font-semibold text-slate-300 border border-white/[0.07] hover:bg-white/[0.05] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading || isFetchingCharacter}
              className="px-4 py-2 rounded text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Character'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/components/wiki/characters/CharacterModal.tsx
git commit -m "feat(characters): add CharacterModal with image upload, all fields, create/edit/delete"
```

---

### Task 11: CharactersPanel container component

**Files:**
- Modify: `app/components/wiki/characters/CharactersPanel.tsx` (replace stub)

- [ ] **Step 1: Implement CharactersPanel**

Replace `app/components/wiki/characters/CharactersPanel.tsx` with the full implementation:

```typescript
import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { Users } from 'lucide-react'
import { WikiCategoryHeader } from '~/components/wiki/shared/WikiCategoryHeader'
import { WikiFilterBar } from '~/components/wiki/shared/WikiFilterBar'
import { CharacterCard } from './CharacterCard'
import { CharacterModal } from './CharacterModal'
import { useCharacters } from '~/hooks/useCharacters'
import { useCampaign } from '~/hooks/useCampaigns'
import type { CharacterListItem } from '~/types/character'

interface CharactersPanelProps {
  onBack: () => void
}

export function CharactersPanel({ onBack }: CharactersPanelProps) {
  const { campaignId } = useParams({ from: '/campaigns/$campaignId/play' })
  const { campaign } = useCampaign(campaignId)

  const [search, setSearch] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [visibility, setVisibility] = useState<'all' | 'public' | 'private'>('all')
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | undefined>()

  const sessions = campaign?.sessions ?? []

  const { characters, isLoading, error } = useCharacters(campaignId, {
    search: search || undefined,
    sessionId: sessionId || undefined,
    visibility,
    tags: filterTags.length > 0 ? filterTags : undefined,
  })

  const handleCreateClick = () => {
    setSelectedCharacterId(undefined)
    setIsModalOpen(true)
  }

  const handleCharacterClick = (character: CharacterListItem) => {
    setSelectedCharacterId(character.id)
    setIsModalOpen(true)
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setSelectedCharacterId(undefined)
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#080A12]">
      <WikiCategoryHeader title="Characters" onBack={onBack} />
      <WikiFilterBar
        search={search}
        onSearchChange={setSearch}
        sessionId={sessionId}
        onSessionChange={setSessionId}
        visibility={visibility}
        onVisibilityChange={setVisibility}
        sessions={sessions}
        onCreateClick={handleCreateClick}
        campaignId={campaignId}
        filterTags={filterTags}
        onFilterTagsChange={setFilterTags}
        searchPlaceholder="Search characters..."
      />

      {/* Character list */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="font-sans font-semibold text-xs text-slate-500 animate-pulse">
            Loading characters...
          </p>
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <p className="font-sans font-semibold text-xs text-rose-400">{error}</p>
        </div>
      ) : characters.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="h-12 w-12 rounded-full bg-white/[0.03] flex items-center justify-center mb-3">
            <Users className="h-6 w-6 text-slate-600" />
          </div>
          <p className="font-sans font-semibold text-xs text-slate-500">
            No characters found matching your filters.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="flex flex-col">
            {characters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                onClick={handleCharacterClick}
              />
            ))}
          </div>
        </div>
      )}

      <CharacterModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        campaignId={campaignId}
        characterId={selectedCharacterId}
        sessions={sessions}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Run the dev server and test manually**

```bash
npm run dev
```

Navigate to a campaign play view, open the Wiki tab, click Characters. Verify:
- Category list shows only Characters
- Clicking Characters shows the filter bar and empty state
- Clicking + opens the create character modal
- Creating a character populates the list
- Cards show avatar, name, race/age/location, tags, visibility icon
- Clicking a card opens edit modal
- Deleting a character removes it from the list

- [ ] **Step 4: Commit**

```bash
git add app/components/wiki/characters/CharactersPanel.tsx
git commit -m "feat(characters): add CharactersPanel with list, search, filter, and modal integration"
```

---

### Task 12: CharacterWindow for GM Screen

**Files:**
- Create: `app/components/wiki/characters/CharacterWindow.tsx`
- Modify: `app/components/mainview/gmscreens/GMScreensView.tsx` (render CharacterWindow for character collection)

- [ ] **Step 1: Create CharacterWindow component**

Create `app/components/wiki/characters/CharacterWindow.tsx`:

```typescript
import { useState, useCallback } from 'react'
import { ChevronDown, ChevronRight, Globe, Lock, ExternalLink, Pencil } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MARKDOWN_PROSE_CLASSES } from '~/utils/markdownProseClasses'
import type { CharacterData, PictureCrop } from '~/types/character'

interface CharacterWindowProps {
  character: CharacterData
  onEdit?: () => void
}

const GRADIENT_PAIRS = [
  ['#3b82f6', '#8b5cf6'],
  ['#f59e0b', '#ef4444'],
  ['#10b981', '#06b6d4'],
  ['#ec4899', '#8b5cf6'],
  ['#f97316', '#eab308'],
  ['#14b8a6', '#3b82f6'],
]

function hashName(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function getInitials(firstName: string, lastName: string): string {
  const f = firstName.charAt(0).toUpperCase()
  const l = lastName.charAt(0).toUpperCase()
  return l ? `${f}${l}` : f
}

function Avatar({ picture, pictureCrop, firstName, lastName, size }: {
  picture: string
  pictureCrop: PictureCrop | null
  firstName: string
  lastName: string
  size: number
}) {
  const fullName = `${firstName} ${lastName}`.trim()
  const initials = getInitials(firstName, lastName)
  const gradientIndex = hashName(fullName) % GRADIENT_PAIRS.length
  const [gradFrom, gradTo] = GRADIENT_PAIRS[gradientIndex]

  return (
    <div
      className="rounded-full flex items-center justify-center overflow-hidden border-[3px] border-white/10"
      style={{
        width: size,
        height: size,
        ...(picture
          ? undefined
          : { background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})` }),
      }}
    >
      {picture ? (
        <img
          src={picture}
          alt={fullName}
          className="w-full h-full object-cover"
          style={
            pictureCrop
              ? { objectPosition: `${pictureCrop.x * 100}% ${pictureCrop.y * 100}%` }
              : undefined
          }
        />
      ) : (
        <span className="text-white font-semibold" style={{ fontSize: size * 0.375 }}>
          {initials}
        </span>
      )}
    </div>
  )
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/[0.03] rounded-lg px-3 py-2.5">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-[13px] text-slate-200">{value}</div>
    </div>
  )
}

function Accordion({
  title,
  defaultOpen,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? false)

  return (
    <div className="border border-white/[0.07] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-3.5 py-2.5 bg-white/[0.03] cursor-pointer"
      >
        <span className="text-[13px] font-semibold text-slate-200">{title}</span>
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
        )}
      </button>
      {isOpen && (
        <div className="px-3.5 py-3 border-t border-white/[0.07]">
          {children}
        </div>
      )}
    </div>
  )
}

export function CharacterWindow({ character, onEdit }: CharacterWindowProps) {
  const fullName = `${character.firstName} ${character.lastName}`.trim()

  const stats: Array<{ label: string; value: string }> = []
  if (character.race) stats.push({ label: 'Race', value: character.race })
  if (character.characterClass) stats.push({ label: 'Class', value: character.characterClass })
  if (character.age != null) stats.push({ label: 'Age', value: String(character.age) })
  if (character.location) stats.push({ label: 'Location', value: character.location })

  return (
    <div className="p-5 overflow-auto h-full">
      {/* Portrait */}
      <div className="flex justify-center mb-4">
        <Avatar
          picture={character.picture}
          pictureCrop={character.pictureCrop}
          firstName={character.firstName}
          lastName={character.lastName}
          size={96}
        />
      </div>

      {/* Name + edit + link */}
      <div className="text-center mb-1">
        <span className="text-lg font-bold text-slate-200">{fullName}</span>
        {character.link && (
          <a
            href={character.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block ml-2 align-middle"
          >
            <ExternalLink className="h-3.5 w-3.5 text-slate-500 hover:text-blue-400 transition-colors" />
          </a>
        )}
      </div>

      {/* Visibility badge */}
      <div className="text-center mb-4">
        {character.isPublic ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-semibold">
            <Globe className="h-3 w-3" /> Public
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[11px] font-semibold">
            <Lock className="h-3 w-3" /> Private
          </span>
        )}
      </div>

      {/* Stats grid */}
      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          {stats.map((s) => (
            <StatBlock key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      )}

      {/* Tags */}
      {character.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-5">
          {character.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-sans font-bold text-[9px] tracking-tight"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Details accordion */}
      {character.notes && (
        <div className="mb-2">
          <Accordion title="Details" defaultOpen>
            <div className={MARKDOWN_PROSE_CLASSES}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{character.notes}</ReactMarkdown>
            </div>
          </Accordion>
        </div>
      )}

      {/* GM Notes accordion */}
      {character.gmNotes && (
        <div className="mb-2">
          <Accordion title="GM Notes">
            <div className={MARKDOWN_PROSE_CLASSES}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{character.gmNotes}</ReactMarkdown>
            </div>
          </Accordion>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Modify GMScreensView to render CharacterWindow**

In `app/components/mainview/gmscreens/GMScreensView.tsx`, this is the key integration point. The current code (around line 350-361) renders all windows as markdown. We need to make it collection-aware.

Add import at the top of GMScreensView.tsx:

```typescript
import { CharacterWindow } from '~/components/wiki/characters/CharacterWindow'
import { Pencil } from 'lucide-react'
```

Find the section where window content is created (the `merged` mapping around line 349-361). The current code looks like:

```typescript
const markdownContent = doc?.content || ''

const windowContent = (
  <div className="p-4 overflow-auto h-full">
    <div className={MARKDOWN_PROSE_CLASSES}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdownContent}</ReactMarkdown>
    </div>
  </div>
)
```

Replace the `windowContent` assignment with collection-aware rendering:

```typescript
const markdownContent = doc?.content || ''

let windowContent: React.ReactNode
if (w.collection === 'character' && doc) {
  // For characters, pass the full hydrated character data
  // The hydrated data from COLLECTION_REGISTRY provides title + content (notes)
  // We need the full character for the window, so we render a CharacterWindow
  // that fetches its own data
  windowContent = (
    <CharacterWindowWrapper
      characterId={w.documentId}
      campaignId={campaignId}
    />
  )
} else {
  windowContent = (
    <div className="p-4 overflow-auto h-full">
      <div className={MARKDOWN_PROSE_CLASSES}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdownContent}</ReactMarkdown>
      </div>
    </div>
  )
}
```

Add a `CharacterWindowWrapper` component at the bottom of GMScreensView.tsx (before the export, or in a separate file if you prefer). This wrapper fetches the full character data and renders CharacterWindow:

```typescript
function CharacterWindowWrapper({ characterId, campaignId }: { characterId: string; campaignId: string }) {
  const { character, isLoading } = useCharacter(characterId, campaignId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-slate-500 animate-pulse">Loading character...</p>
      </div>
    )
  }

  if (!character) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-slate-500">Character not found</p>
      </div>
    )
  }

  return <CharacterWindow character={character} />
}
```

Add the import for `useCharacter` at the top:

```typescript
import { useCharacter } from '~/hooks/useCharacters'
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Test GM Screen integration manually**

```bash
npm run dev
```

- Create a character in the Wiki panel
- Drag the character card onto a GM Screen
- Verify the character sheet layout appears with portrait, stats grid, accordions
- Verify duplicate drop flashes the existing window
- Edit the character and verify the window updates

- [ ] **Step 5: Commit**

```bash
git add app/components/wiki/characters/CharacterWindow.tsx app/components/mainview/gmscreens/GMScreensView.tsx
git commit -m "feat(characters): add CharacterWindow and GM Screen collection-aware rendering"
```

---

### Task 13: Edit button on GM Screen character window title bar

**Files:**
- Modify: `app/components/mainview/gmscreens/GMScreensView.tsx`

The FloatingWindow component renders a title bar with minimize/maximize/close. We need an edit button for character windows. Since FloatingWindow doesn't have a slot for extra title bar buttons, we'll add an edit callback on the `ManagedWindow` type and render the edit icon inside the window content (top-right, sticky).

- [ ] **Step 1: Add edit button to CharacterWindowWrapper**

Modify the `CharacterWindowWrapper` component in `GMScreensView.tsx` to accept and render an edit callback:

```typescript
function CharacterWindowWrapper({
  characterId,
  campaignId,
  onEdit,
}: {
  characterId: string
  campaignId: string
  onEdit: () => void
}) {
  const { character, isLoading } = useCharacter(characterId, campaignId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-slate-500 animate-pulse">Loading character...</p>
      </div>
    )
  }

  if (!character) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-slate-500">Character not found</p>
      </div>
    )
  }

  return (
    <div className="relative h-full">
      <button
        type="button"
        onClick={onEdit}
        className="absolute top-2 right-2 z-10 p-1.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white transition-colors"
        aria-label="Edit character"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <CharacterWindow character={character} />
    </div>
  )
}
```

- [ ] **Step 2: Wire up edit to open CharacterModal from GM Screen**

Add state and modal rendering in `GMScreensView`. Add state:

```typescript
const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null)
```

Update the character window content creation to pass `onEdit`:

```typescript
if (w.collection === 'character' && doc) {
  windowContent = (
    <CharacterWindowWrapper
      characterId={w.documentId}
      campaignId={campaignId}
      onEdit={() => setEditingCharacterId(w.documentId)}
    />
  )
}
```

Add at the bottom of the component's JSX return (inside the outermost div, alongside other dialogs):

```typescript
import { CharacterModal } from '~/components/wiki/characters/CharacterModal'
import { useCampaign } from '~/hooks/useCampaigns'
```

Inside the component, get campaign sessions:

```typescript
const { campaign } = useCampaign(campaignId)
const campaignSessions = campaign?.sessions ?? []
```

Add the modal:

```typescript
<CharacterModal
  isOpen={editingCharacterId !== null}
  onClose={() => setEditingCharacterId(null)}
  campaignId={campaignId}
  characterId={editingCharacterId ?? undefined}
  sessions={campaignSessions}
/>
```

- [ ] **Step 3: Verify TypeScript compiles and test manually**

```bash
npx tsc --noEmit
npm run dev
```

Test: drag character to GM Screen, click edit pencil, modify character, save, verify window updates.

- [ ] **Step 4: Commit**

```bash
git add app/components/mainview/gmscreens/GMScreensView.tsx
git commit -m "feat(characters): add edit button on GM Screen character window"
```

---

### Task 14: Final integration testing and cleanup

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Run existing tests**

```bash
npm test
```

Expected: All existing tests pass — no regressions.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Fix any lint errors in new files.

- [ ] **Step 4: Manual end-to-end testing checklist**

Test each of these scenarios:
- [ ] Wiki Panel shows only Characters category
- [ ] Clicking Characters shows header with back chevron + filter bar
- [ ] Back button returns to category list
- [ ] Search filters characters by name, race, location
- [ ] Session filter works (union of introduced + appeared)
- [ ] Visibility filter works (all/public/private)
- [ ] Tag filter works
- [ ] + button opens create modal
- [ ] Create character with all fields — verify card appears in list
- [ ] Create character with minimal fields (just first/last name) — verify card shows initials
- [ ] Upload image — crop tool appears, drag/zoom works, confirm uploads and shows circle
- [ ] Edit character from wiki card click — modal populates, save works
- [ ] Delete character from edit modal — confirmation, then removes
- [ ] Drag character to GM Screen — window appears with character sheet layout
- [ ] Character window shows portrait, name, stats grid, tags, accordions
- [ ] External link icon appears on card and window when link is set
- [ ] Edit from GM Screen pencil icon — modal opens, save updates window
- [ ] Duplicate drag — flashes existing window
- [ ] Private characters only visible to creator
- [ ] GM Notes visible only to GM

- [ ] **Step 5: Fix any issues found**

Address any bugs discovered during testing.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(characters): final integration testing and cleanup"
```
