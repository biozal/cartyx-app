# Universal Tag System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-campaign Tag collection with autocomplete support across all entity forms, and a tag filter in the NotesPanel.

**Architecture:** A new `Tag` Mongoose model stores canonical tag names per campaign. A `useTags` hook provides autocomplete data. A shared `TagAutocompleteInput` component handles chip display + autocomplete and is used by both the NotesFilterWidget and NoteModal. Server functions `listTags` and `ensureTags` provide the API layer.

**Tech Stack:** MongoDB/Mongoose, TanStack Start (server functions), TanStack React Query, React 19, TypeScript, Tailwind CSS, Zod

---

### Task 1: Tag Mongoose Model

**Files:**
- Create: `app/server/db/models/Tag.ts`

- [ ] **Step 1: Create the Tag model**

```typescript
// app/server/db/models/Tag.ts
import mongoose from 'mongoose'

const tagSchema = new mongoose.Schema({
  name: { type: String, required: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

tagSchema.index({ campaignId: 1, name: 1 }, { unique: true })
tagSchema.index({ campaignId: 1 })

export const Tag = mongoose.models.Tag || mongoose.model('Tag', tagSchema)
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `Tag.ts`

- [ ] **Step 3: Commit**

```bash
git add app/server/db/models/Tag.ts
git commit -m "feat(tags): add Tag mongoose model with campaign-scoped unique index"
```

---

### Task 2: Tag Types and Zod Schemas

**Files:**
- Create: `app/types/tag.ts`

- [ ] **Step 1: Create tag types and schemas**

```typescript
// app/types/tag.ts
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
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `tag.ts`

- [ ] **Step 3: Commit**

```bash
git add app/types/tag.ts
git commit -m "feat(tags): add tag TypeScript types and Zod schemas"
```

---

### Task 3: Tag Server Functions

**Files:**
- Create: `app/server/functions/tags.ts`

- [ ] **Step 1: Create the tags server functions**

This file provides `listTags` and `ensureTags`. The `ensureTags` function uses `bulkWrite` with upsert to efficiently create missing tags in a single round trip.

```typescript
// app/server/functions/tags.ts
import { createServerFn } from '@tanstack/react-start'
import { getSession } from '../session'
import { connectDB, isDBConnected } from '../db/connection'
import { User } from '../db/models/User'
import { Campaign } from '../db/models/Campaign'
import { Tag } from '../db/models/Tag'
import { serverCaptureException } from '../utils/posthog'
import { normalizeTags } from '../utils/helpers'
import type { TagListItem } from '~/types/tag'
import { listTagsSchema, ensureTagsSchema } from '~/types/tag'

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
// listTags
// ---------------------------------------------------------------------------

export { listTagsSchema }

export const listTags = createServerFn({ method: 'GET' })
  .inputValidator(listTagsSchema)
  .handler(async ({ data }): Promise<TagListItem[]> => {
    let sessionUserId: string | undefined
    try {
      const member = await requireCampaignMember(data.campaignId)
      sessionUserId = member.sessionUserId

      const docs = await Tag.find({ campaignId: data.campaignId })
        .select('name')
        .sort({ name: 1 })
        .lean()

      return docs.map((d: { _id: unknown; name?: string }) => ({
        id: String(d._id),
        name: d.name ?? '',
      }))
    } catch (e) {
      serverCaptureException(e, sessionUserId, { action: 'listTags', campaignId: data.campaignId })
      throw e
    }
  })

// ---------------------------------------------------------------------------
// ensureTags
// ---------------------------------------------------------------------------

export { ensureTagsSchema }

export const ensureTags = createServerFn({ method: 'POST' })
  .inputValidator(ensureTagsSchema)
  .handler(async ({ data }) => {
    let sessionUserId: string | undefined
    try {
      const member = await requireCampaignMember(data.campaignId)
      sessionUserId = member.sessionUserId
      const userId = member.userId

      const normalized = normalizeTags(data.tags)
      if (normalized.length === 0) return { success: true }

      const ops = normalized.map((name) => ({
        updateOne: {
          filter: { campaignId: data.campaignId, name },
          update: {
            $setOnInsert: {
              name,
              campaignId: data.campaignId,
              createdBy: userId,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
          upsert: true,
        },
      }))

      await Tag.bulkWrite(ops, { ordered: false })
      return { success: true }
    } catch (e) {
      serverCaptureException(e, sessionUserId, { action: 'ensureTags', campaignId: data.campaignId })
      throw e
    }
  })
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `tags.ts`

- [ ] **Step 3: Commit**

```bash
git add app/server/functions/tags.ts
git commit -m "feat(tags): add listTags and ensureTags server functions"
```

---

### Task 4: Integrate ensureTags into Note Create/Update

**Files:**
- Modify: `app/server/functions/notes.ts:103-138` (createNote handler)
- Modify: `app/server/functions/notes.ts:146-182` (updateNote handler)

- [ ] **Step 1: Add ensureTags import**

At the top of `app/server/functions/notes.ts`, add the import for `ensureTagsFn` (a local caller that bypasses the RPC layer). Since `ensureTags` is in the same server context, we call it directly:

Add after the existing imports (after line 17):

```typescript
import { ensureTags as ensureTagsFn } from './tags'
```

- [ ] **Step 2: Call ensureTags in createNote handler**

In the `createNote` handler, after `const doc = await Note.create(noteData)` (line 126) and before the `serverCaptureEvent` call (line 128), add:

```typescript
      // Register any new tags in the campaign tag registry
      await ensureTagsFn({ data: { campaignId: data.campaignId, tags: finalTags } })
```

Where `finalTags` refers to the normalized tags. Since `normalizeTags` is already called on line 118, capture the result. Change line 118 from:

```typescript
        tags: normalizeTags(data.tags ?? []),
```

to:

```typescript
        tags: finalTags,
```

And add before `const noteData` (before line 113):

```typescript
      const finalTags = normalizeTags(data.tags ?? [])
```

- [ ] **Step 3: Call ensureTags in updateNote handler**

In the `updateNote` handler, after `await existing.save()` (line 169) and before the `serverCaptureEvent` call (line 171), add:

```typescript
      // Register any new tags in the campaign tag registry
      await ensureTagsFn({ data: { campaignId: data.campaignId, tags: normalizeTags(data.tags ?? []) } })
```

- [ ] **Step 4: Verify the file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add app/server/functions/notes.ts
git commit -m "feat(tags): call ensureTags on note create and update"
```

---

### Task 5: Add Tags Filter to listNotes

**Files:**
- Modify: `app/types/schemas/notes.ts:27-32` (listNotesSchema)
- Modify: `app/server/functions/notes.ts:239-291` (listNotes handler)

- [ ] **Step 1: Add tags field to listNotesSchema**

In `app/types/schemas/notes.ts`, update the `listNotesSchema` to include an optional `tags` array:

```typescript
export const listNotesSchema = z.object({
  campaignId: z.string().min(1),
  sessionId: z.string().optional(),
  search: z.string().optional(),
  visibility: z.enum(['all', 'public', 'private']).optional().default('all'),
  tags: z.array(z.string()).optional(),
})
```

- [ ] **Step 2: Add tags filter to listNotes query**

In `app/server/functions/notes.ts`, in the `listNotes` handler, after the search filter block (after line 269 `filter.$text = { $search: data.search.trim() }`) and before the `const docs = await Note.find(filter)` line, add:

```typescript
      if (data.tags && data.tags.length > 0) {
        filter.tags = { $all: data.tags }
      }
```

- [ ] **Step 3: Verify the file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/types/schemas/notes.ts app/server/functions/notes.ts
git commit -m "feat(tags): add tags filter to listNotes query with AND logic"
```

---

### Task 6: Query Keys and useTags Hook

**Files:**
- Modify: `app/utils/queryKeys.ts`
- Create: `app/hooks/useTags.ts`
- Modify: `app/hooks/useNotes.ts`

- [ ] **Step 1: Add tags query keys**

In `app/utils/queryKeys.ts`, add a `tags` group after the `notes` group:

```typescript
  tags: {
    all: ['tags'] as const,
    list: (campaignId: string) => ['tags', 'list', campaignId] as const,
  },
```

- [ ] **Step 2: Update notes.list query key to include tags**

In `app/utils/queryKeys.ts`, update the `notes.list` function to include a tags parameter:

```typescript
    list: (campaignId: string, sessionId?: string, search?: string, visibility?: string, tags?: string[]) =>
      ['notes', 'list', campaignId, sessionId ?? '', search ?? '', visibility ?? 'all', ...(tags ?? [])] as const,
```

- [ ] **Step 3: Create useTags hook**

```typescript
// app/hooks/useTags.ts
import { createServerFn } from '@tanstack/react-start'
import { useQuery } from '@tanstack/react-query'
import type { TagListItem } from '~/types/tag'
import { listTagsSchema } from '~/types/tag'
import { queryKeys } from '~/utils/queryKeys'

const listTagsFn = createServerFn({ method: 'GET' })
  .inputValidator(listTagsSchema)
  .handler(async ({ data }) => {
    const { listTags } = await import('~/server/functions/tags')
    return listTags({ data })
  })

export function useTags(campaignId: string) {
  const { data: tags = [], isLoading, error } = useQuery({
    queryKey: queryKeys.tags.list(campaignId),
    queryFn: () => listTagsFn({ data: { campaignId } }),
    enabled: !!campaignId,
  })

  return {
    tags: tags as TagListItem[],
    isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
  }
}
```

- [ ] **Step 4: Update useNotes to accept tags filter and invalidate tags**

In `app/hooks/useNotes.ts`:

Update the `ListNotesFilters` interface (line 58-62) to add `tags`:

```typescript
interface ListNotesFilters {
  sessionId?: string
  search?: string
  visibility?: 'all' | 'public' | 'private'
  tags?: string[]
}
```

In the `useNotes` function, extract the tags filter (after line 67):

```typescript
  const tags = filters?.tags
```

Update the query key call (line 70) to include tags:

```typescript
    queryKey: queryKeys.notes.list(campaignId, sessionId, search, visibility, tags),
```

Update the `queryFn` call (line 71-78) to pass tags:

```typescript
    queryFn: () =>
      listNotesFn({
        data: {
          campaignId,
          sessionId,
          search,
          visibility,
          tags,
        },
      }),
```

In `useCreateNote`, update the `onSuccess` callback (lines 118-120) to also invalidate tags:

```typescript
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.tags.all })
    },
```

In `useUpdateNote`, update the `onSuccess` callback (lines 156-161) to also invalidate tags:

```typescript
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.gmscreens.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.tags.all })
    },
```

- [ ] **Step 5: Verify all files compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add app/utils/queryKeys.ts app/hooks/useTags.ts app/hooks/useNotes.ts
git commit -m "feat(tags): add useTags hook, tags query keys, and tags filter to useNotes"
```

---

### Task 7: TagAutocompleteInput Component

**Files:**
- Create: `app/components/shared/TagAutocompleteInput.tsx`

- [ ] **Step 1: Create the shared component**

```typescript
// app/components/shared/TagAutocompleteInput.tsx
import React, { useState, useRef, useCallback, useId, useEffect } from 'react'
import { X } from 'lucide-react'
import { useTags } from '~/hooks/useTags'

interface TagAutocompleteInputProps {
  campaignId: string
  selectedTags: string[]
  onTagsChange: (tags: string[]) => void
  placeholder?: string
  disabled?: boolean
}

export function TagAutocompleteInput({
  campaignId,
  selectedTags,
  onTagsChange,
  placeholder = 'Type a tag and press Enter',
  disabled = false,
}: TagAutocompleteInputProps) {
  const { tags: allTags } = useTags(campaignId)
  const [input, setInput] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputId = useId()

  const suggestions = allTags
    .filter((t) => !selectedTags.includes(t.name))
    .filter((t) => input.trim() === '' ? false : t.name.startsWith(input.trim().toLowerCase().replace(/^#/, '')))

  // Reset highlight when suggestions change
  useEffect(() => {
    setHighlightIndex(-1)
  }, [suggestions.length, input])

  const addTag = useCallback((raw: string) => {
    const cleaned = raw.replace(/^#/, '').trim().toLowerCase()
    if (cleaned && !selectedTags.includes(cleaned)) {
      onTagsChange([...selectedTags, cleaned])
    }
    setInput('')
    setIsOpen(false)
  }, [selectedTags, onTagsChange])

  const removeTag = useCallback((tag: string) => {
    onTagsChange(selectedTags.filter((t) => t !== tag))
  }, [selectedTags, onTagsChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (suggestions.length > 0) {
        setIsOpen(true)
        setHighlightIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0))
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (suggestions.length > 0) {
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1))
      }
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
        addTag(suggestions[highlightIndex].name)
      } else if (input.trim()) {
        addTag(input)
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      setHighlightIndex(-1)
    } else if (e.key === 'Backspace' && input === '') {
      if (selectedTags.length > 0) {
        onTagsChange(selectedTags.slice(0, -1))
      }
    }
  }, [input, highlightIndex, suggestions, addTag, selectedTags, onTagsChange])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
    setIsOpen(true)
  }, [])

  const handleBlur = useCallback(() => {
    // Delay to allow click on dropdown item to fire first
    setTimeout(() => {
      if (input.trim()) {
        addTag(input)
      }
      setIsOpen(false)
      setHighlightIndex(-1)
    }, 150)
  }, [input, addTag])

  return (
    <div className="relative">
      <div
        className={[
          'flex flex-wrap items-center gap-1.5 bg-white/[0.04] border rounded-xl px-3 py-2 min-h-[44px] transition-all',
          'focus-within:border-blue-500/50 border-white/10',
          disabled ? 'opacity-50 cursor-not-allowed' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => inputRef.current?.focus()}
      >
        {selectedTags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-sans font-bold text-[11px] tracking-tight"
          >
            #{tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                removeTag(tag)
              }}
              className="ml-0.5 text-blue-400/60 hover:text-blue-300 transition-colors"
              aria-label={`Remove tag ${tag}`}
              disabled={disabled}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={() => { if (input.trim()) setIsOpen(true) }}
          placeholder={selectedTags.length === 0 ? placeholder : ''}
          disabled={disabled}
          className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-slate-200 text-sm placeholder-slate-700"
          aria-label="Add tag"
          autoComplete="off"
        />
      </div>

      {isOpen && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 left-0 right-0 mt-1 bg-[#0f1520] border border-white/10 rounded-lg py-1 shadow-2xl max-h-48 overflow-y-auto"
        >
          <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Suggestions
          </div>
          {suggestions.map((tag, index) => (
            <button
              key={tag.id}
              type="button"
              className={[
                'w-full text-left px-3 py-1.5 text-xs font-semibold transition-colors',
                index === highlightIndex
                  ? 'bg-blue-500/10 text-slate-200'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
              ].join(' ')}
              onMouseDown={(e) => {
                e.preventDefault()
                addTag(tag.name)
              }}
              onMouseEnter={() => setHighlightIndex(index)}
            >
              #{tag.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/components/shared/TagAutocompleteInput.tsx
git commit -m "feat(tags): add shared TagAutocompleteInput component with autocomplete"
```

---

### Task 8: Integrate TagAutocompleteInput into NoteModal

**Files:**
- Modify: `app/components/mainview/notes/NoteModal.tsx`

- [ ] **Step 1: Replace inline tag logic with TagAutocompleteInput**

In `app/components/mainview/notes/NoteModal.tsx`:

Add the import (after line 7):

```typescript
import { TagAutocompleteInput } from '~/components/shared/TagAutocompleteInput'
```

Remove the `tagInput` state declaration (line 42):
```typescript
  const [tagInput, setTagInput] = useState('')
```

Remove `tagInputId` (line 49):
```typescript
  const tagInputId = useId()
```

Remove `useId` from the React import on line 1 (keep the other imports).

In the reset effect (lines 53-65), remove the `setTagInput('')` line.

Remove the `addTag` callback (lines 99-105).

Remove the `handleTagKeyDown` callback (lines 107-114).

Remove the `removeTag` callback (lines 116-118).

In `handleSubmit` (lines 120-162), simplify the tag flushing. Remove lines 130-137 (the `pendingTag` block) and change `finalTags` to just `tags`:

```typescript
    const input = {
      campaignId,
      title: title.trim(),
      note: content.trim(),
      tags,
      isPublic,
      ...(sessionId ? { sessionId } : {}),
    }
```

Replace the entire tag chips JSX section (lines 246-297, from `{/* Tag chips input */}` through the closing `</div>` and hint paragraph) with:

```tsx
          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2 tracking-wide">
              Tags
            </label>
            <TagAutocompleteInput
              campaignId={campaignId}
              selectedTags={tags}
              onTagsChange={setTags}
              placeholder="Type a tag and press Enter"
              disabled={isDisabled}
            />
            <p className="text-xs text-slate-700 mt-1.5">
              Press Enter or comma to add. Suggestions appear as you type.
            </p>
          </div>
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Manually test in browser**

1. Open the app, navigate to a campaign
2. Open the Notes panel, click the + button to create a note
3. Verify the tag input shows autocomplete suggestions as you type
4. Verify Enter/comma adds tags, backspace removes them
5. Verify clicking a suggestion adds it

- [ ] **Step 4: Commit**

```bash
git add app/components/mainview/notes/NoteModal.tsx
git commit -m "feat(tags): replace NoteModal inline tag input with TagAutocompleteInput"
```

---

### Task 9: Add Tag Filter to NotesFilterWidget and NotesPanel

**Files:**
- Modify: `app/components/mainview/notes/NotesFilterWidget.tsx`
- Modify: `app/components/mainview/notes/NotesPanel.tsx`

- [ ] **Step 1: Update NotesFilterWidget**

In `app/components/mainview/notes/NotesFilterWidget.tsx`:

Add the import at the top:

```typescript
import { TagAutocompleteInput } from '~/components/shared/TagAutocompleteInput'
```

Update the props interface to add tag filter props and campaignId:

```typescript
interface NotesFilterWidgetProps {
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
}
```

Add the new props to the destructured parameters:

```typescript
export function NotesFilterWidget({
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
}: NotesFilterWidgetProps) {
```

Add a third row inside the outer `<div>`, after the session/visibility `<div>` (after line 81, before the closing `</div>`):

```tsx
      <TagAutocompleteInput
        campaignId={campaignId}
        selectedTags={filterTags}
        onTagsChange={onFilterTagsChange}
        placeholder="Filter by tags..."
      />
```

- [ ] **Step 2: Update NotesPanel to wire tag filter state**

In `app/components/mainview/notes/NotesPanel.tsx`:

Add a new state variable after the `visibility` state (after line 16):

```typescript
  const [filterTags, setFilterTags] = useState<string[]>([])
```

Update the `useNotes` call (lines 22-26) to pass the tags filter:

```typescript
  const { notes, isLoading, error } = useNotes(campaignId, {
    search: search || undefined,
    sessionId: sessionId || undefined,
    visibility,
    tags: filterTags.length > 0 ? filterTags : undefined,
  })
```

Update the `<NotesFilterWidget>` JSX (lines 45-54) to pass the new props:

```tsx
      <NotesFilterWidget
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
      />
```

- [ ] **Step 3: Verify all files compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Manually test in browser**

1. Open the app, navigate to a campaign with notes that have tags
2. In the Notes panel, the tag filter row should appear below session/visibility
3. Type a tag name — autocomplete suggestions should appear
4. Select a tag — the notes list should filter to only notes with that tag
5. Add a second tag — notes list should show only notes with BOTH tags (AND logic)
6. Remove a tag chip — list should update accordingly
7. Verify text search still works alongside tag filtering

- [ ] **Step 5: Commit**

```bash
git add app/components/mainview/notes/NotesFilterWidget.tsx app/components/mainview/notes/NotesPanel.tsx
git commit -m "feat(tags): add tag filter to NotesPanel with AND logic"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Run TypeScript compilation check**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 2: Run the dev server and test end-to-end**

Run: `npm run dev`

Test the full flow:
1. Create a note with tags "combat", "boss", "session-1"
2. Create another note with tags "combat", "lore"
3. In the tag filter, type "com" — should see "combat" in autocomplete
4. Select "combat" — both notes should appear
5. Add "boss" to filter — only the first note should appear
6. Remove "boss" — both notes appear again
7. Edit a note and add a new tag "treasure" — it should appear in autocomplete for the next note
8. Verify text search + tag filter work together

- [ ] **Step 3: Commit any fixes if needed**
