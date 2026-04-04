# Universal Tag System Design

## Overview

Add a dedicated Tag collection scoped per-campaign that serves as the canonical registry for all tags in the system. Tags are flat labels (lowercase, trimmed strings) shared across notes and future wiki entities (characters, locations, creatures, quests, etc.). The system provides autocomplete when adding tags to any entity, and a new tag filter in the NotesPanel for filtering notes by selected tags using AND logic.

## Goals

- Universal tag registry per campaign with autocomplete across all entity types
- Tag filter in NotesPanel (separate from text search) with AND logic
- Shared `TagAutocompleteInput` component reusable by all current and future entity forms
- Frictionless tag creation — new tags auto-created silently on entity save
- No migration needed — existing data can be discarded

## Data Model

### New: Tag Collection

```
Tag {
  name: String        // normalized (lowercase, trimmed, no '#' prefix)
  campaignId: ObjectId // ref: Campaign
  createdBy: ObjectId  // ref: User
  createdAt: Date
  updatedAt: Date
}

Indexes:
  { campaignId: 1, name: 1 }  // unique compound — one tag per name per campaign
  { campaignId: 1 }            // list all tags for a campaign
```

### Unchanged: Note Schema

Notes continue to store `tags: [String]` as normalized name strings. No foreign key references to the Tag collection. The Tag collection is a registry for autocomplete and discovery, not a relational join target.

### Tag Normalization

Existing `normalizeTag()` and `normalizeTags()` helpers in `app/server/utils/helpers.ts` are reused as-is. They handle trimming, lowercasing, removing `#` prefix, and deduplication.

## Server Functions

### New: `app/server/functions/tags.ts`

#### `listTags(campaignId: string)`
- Returns all tags for a campaign, sorted alphabetically by name
- Requires campaign membership (via `requireCampaignMember`)
- Used by `useTags` hook for autocomplete data

#### `ensureTags(campaignId: string, tags: string[], userId: string)`
- Upserts an array of tag names into the Tag collection
- Uses `bulkWrite` with `updateOne` + `upsert: true` for each tag — single round trip
- Called internally during note create/update (and future entity saves)
- No-ops for tags that already exist

### Modified: `app/server/functions/notes.ts`

#### `createNote`
- After saving the note, calls `ensureTags(campaignId, note.tags, userId)`

#### `updateNote`
- After updating the note, calls `ensureTags(campaignId, note.tags, userId)`

#### `listNotes`
- New optional parameter: `tags: string[]`
- When provided and non-empty, adds `{ tags: { $all: data.tags } }` to the MongoDB query
- Composes with existing text search, session, and visibility filters

## Types & Schemas

### New: `app/types/tag.ts`

```typescript
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
```

### Modified: `app/types/schemas/noteSchemas.ts`

- Add optional `tags: z.array(z.string()).optional()` to the list notes input schema

## Hooks

### New: `app/hooks/useTags.ts`

```typescript
useTags(campaignId: string) → { tags: TagListItem[], isLoading: boolean }
```

- `useQuery` calling `listTags` server function
- Query key: `['tags', 'list', campaignId]`

### Modified: `app/hooks/useNotes.ts`

- Accept optional `tags: string[]` in filter options, pass through to `listNotes`
- Note create/update mutations invalidate `['tags', 'list', campaignId]` in addition to notes queries

### Modified: `app/utils/queryKeys.ts`

```typescript
tags: {
  all: ['tags'] as const,
  list: (campaignId: string) => ['tags', 'list', campaignId] as const,
}
```

## UI Components

### New: `app/components/shared/TagAutocompleteInput.tsx`

Shared chip-based tag input with autocomplete dropdown. Used by both the filter widget and the note modal (and future entity forms).

**Props:**
- `campaignId: string` — drives the `useTags` query
- `selectedTags: string[]` — currently selected tags (controlled)
- `onTagsChange: (tags: string[]) => void` — callback when tags change
- `placeholder?: string` — customizable placeholder text
- `disabled?: boolean`

**Behavior:**
- Fetches all campaign tags via `useTags(campaignId)`
- Client-side prefix filtering of suggestions, excluding already-selected tags
- Dropdown appears when input has text and there are matching suggestions
- Keyboard navigation: Up/Down arrows to highlight, Enter to select highlighted suggestion or add raw input, Escape to close dropdown
- Click on suggestion to select it
- Backspace on empty input removes the last chip
- Comma and Enter keys add current input as a tag
- On blur, adds any pending input text as a tag and closes dropdown
- Chips display with `#` prefix and an `✕` remove button

**Styling:** Matches existing NoteModal tag chip styling — blue pill chips on dark background with the same border, font, and spacing patterns.

### Modified: `app/components/mainview/notes/NotesFilterWidget.tsx`

- New prop: `filterTags: string[]` and `onFilterTagsChange: (tags: string[]) => void`
- New prop: `campaignId: string`
- Renders `<TagAutocompleteInput>` as a third row below the session/visibility filter row
- Placeholder text: "Filter by tags..."

### Modified: `app/components/mainview/notes/NotesPanel.tsx`

- New state: `filterTags: string[]` (default `[]`)
- Passes `filterTags` and setter to `NotesFilterWidget`
- Passes `filterTags` to `useNotes` filter options

### Modified: `app/components/mainview/notes/NoteModal.tsx`

- Replaces inline tag state management (`tagInput`, `addTag`, `handleTagKeyDown`, `removeTag`, `onBlur` logic) with `<TagAutocompleteInput>`
- The modal still owns `tags` state and passes it as `selectedTags` / `onTagsChange`
- Tag flushing on submit simplified — `TagAutocompleteInput` handles pending input on blur

## New Files

| File | Purpose |
|------|---------|
| `app/server/db/models/Tag.ts` | Mongoose schema and model |
| `app/server/functions/tags.ts` | `listTags` and `ensureTags` server functions |
| `app/hooks/useTags.ts` | React Query hook for tag autocomplete |
| `app/components/shared/TagAutocompleteInput.tsx` | Shared chip + autocomplete component |
| `app/types/tag.ts` | TypeScript types and Zod schemas |

## Modified Files

| File | Change |
|------|--------|
| `app/server/functions/notes.ts` | Call `ensureTags` on create/update; add `tags` filter to `listNotes` |
| `app/types/schemas/noteSchemas.ts` | Add optional `tags` to list notes input schema |
| `app/hooks/useNotes.ts` | Accept `tags` filter; invalidate tags query on mutations |
| `app/utils/queryKeys.ts` | Add `tags` query key group |
| `app/components/mainview/notes/NotesFilterWidget.tsx` | Add tag filter row with `TagAutocompleteInput` |
| `app/components/mainview/notes/NotesPanel.tsx` | Add `filterTags` state, wire to filter widget and hook |
| `app/components/mainview/notes/NoteModal.tsx` | Replace inline tag logic with `TagAutocompleteInput` |
