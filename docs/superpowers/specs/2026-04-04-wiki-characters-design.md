# Wiki Characters Feature Design

**Date:** 2026-04-04  
**Status:** Approved  
**Approach:** Mirror Notes Pattern (Approach A) — parallel system with shared UI components

## Overview

Add a Characters category to the Wiki Panel, enabling GMs and players to create, search, filter, and manage TTRPG characters. Characters can be dragged onto GM Screens where they appear as floating windows with a character sheet layout. The feature mirrors the Notes system in architecture while introducing character-specific fields, image upload with circular crop, and multi-session tracking.

## Data Model

### Character MongoDB Schema

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `firstName` | String | Yes | — | |
| `lastName` | String | Yes | — | |
| `race` | String | No | `""` | |
| `characterClass` | String | No | `""` | Freeform text (e.g., "Paladin", "Fighter/Wizard") |
| `age` | Number | No | `null` | Positive integer |
| `location` | String | No | `""` | Current residence |
| `link` | String | No | `""` | HTTP URL to an external webpage (e.g., D&D Beyond character sheet, wiki page) |
| `picture` | String | No | `""` | URL/path to uploaded image in storage |
| `pictureCrop` | Object | No | `null` | `{ x: Number, y: Number, width: Number, height: Number }` — normalized 0-1 values relative to original image dimensions, defining the visible crop region |
| `notes` | String | No | `""` | Markdown, public if character is public |
| `gmNotes` | String | No | `""` | Markdown, GM-only always |
| `tags` | [String] | No | `[]` | Same tag system as Notes |
| `isPublic` | Boolean | No | `false` | Same visibility model as Notes |
| `sessionId` | ObjectId ref Session | No | `null` | Session introduced in |
| `sessions` | [ObjectId ref Session] | No | `[]` | Sessions appeared in |
| `campaignId` | ObjectId ref Campaign | Yes | — | |
| `createdBy` | ObjectId ref User | Yes | — | |
| `createdAt` | Date | No | `Date.now` | |
| `updatedAt` | Date | No | `Date.now` | |

### Indexes

- `{ campaignId: 1, updatedAt: -1 }` — listing
- `{ campaignId: 1 }` — base filter
- `{ sessionId: 1 }` — filter by introduced session
- `{ sessions: 1 }` — filter by appeared sessions
- `{ tags: 1 }` — tag filtering
- `{ isPublic: 1 }` — visibility filtering
- `{ createdBy: 1 }` — ownership
- `{ firstName: 'text', lastName: 'text', race: 'text', location: 'text', notes: 'text', gmNotes: 'text' }` — full-text search

### Serialization

- `serializeCharacter()` — full document with all fields
- `serializeCharacterListItem()` — omits `notes` and `gmNotes` content, includes everything needed for the card display

### Permissions

- Same model as Notes: creator sees their own private characters, public characters visible to all campaign members
- `gmNotes` field only returned when the requester is the GM
- Only the creator can update/delete a character

## File Structure

```
app/components/wiki/
├── WikiPanel.tsx                    # Refactored — category list, routes to sub-panels
├── shared/
│   ├── WikiCategoryHeader.tsx       # Back chevron + category title (reusable)
│   └── WikiFilterBar.tsx            # Search, +add, tags, session, visibility (reusable)
└── characters/
    ├── CharactersPanel.tsx          # Container — state, filters, list orchestration
    ├── CharacterCard.tsx            # List item — avatar, name, race, age, location, tags, visibility
    ├── CharacterModal.tsx           # Create/edit form with image crop
    ├── CharacterWindow.tsx          # GM Screen window content — sheet layout with accordions
    └── ImageCropInput.tsx           # Upload + drag/zoom circular crop component
```

### WikiPanel Changes

- Move from `app/components/mainview/WikiPanel.tsx` to `app/components/wiki/WikiPanel.tsx`
- Remove all categories except Characters
- When Characters is selected, render `CharactersPanel` instead of "Coming Soon" placeholder
- Update all import paths

### Shared Components

**WikiCategoryHeader** — Props: `title: string`, `onBack: () => void`
- Left chevron icon + title text
- Calls `onBack` to return to WikiPanel category list
- Reusable across all future wiki categories

**WikiFilterBar** — Props:
- `search`, `onSearchChange` — text search input
- `onCreateClick` — "+" button callback
- `filterTags`, `onFilterTagsChange` — tag filter (uses existing TagAutocompleteInput)
- `sessionId`, `onSessionChange` — session dropdown
- `sessions` — session list for dropdown
- `visibility`, `onVisibilityChange` — all/public/private select
- `campaignId` — for tag autocomplete context

Same filter set as NotesFilterWidget, extracted as a reusable component.

## Character Card (Wiki Panel List)

Contact-list style layout:
- **Left:** 48px circular avatar (cropped image or initials fallback on deterministic gradient)
- **Right:** Name + visibility icon (globe/lock) + external link icon (if link set, opens in new tab), info line (Race · Age · Location — only populated fields), tag pills

Behavior:
- Draggable with payload `{ collection: 'character', documentId, title: "firstName lastName" }`
- Click opens CharacterModal in edit mode

### Initials Fallback

When no picture is uploaded, display initials on a gradient background. Gradient color pair is deterministic, derived from a hash of the character name.

## Character Window (GM Screen)

Character sheet layout inside FloatingWindow:

1. **Title bar** — provided by FloatingWindow, with an added edit pencil icon next to minimize/maximize/close buttons
2. **Circular portrait** — 96px, centered (cropped image or initials fallback)
3. **Name** — centered, large text, with external link icon if link is set (opens in new tab)
4. **Visibility badge** — "Public" or "Private" pill
5. **Stats grid** — 2x2 grid of labeled fields (Race, Class, Age, Location), only shows populated fields
6. **Tags** — colored pills
7. **Details accordion** — public notes rendered as markdown, open by default
8. **GM Notes accordion** — GM-only markdown, collapsed by default

Content area scrolls for characters with long notes. Edit pencil opens CharacterModal in edit mode. After save, window content updates optimistically (same pattern as Notes).

## Character Modal (Create/Edit Form)

Full-screen overlay via portal, same pattern as NoteModal.

### Form Fields (in order)

| Field | Component | Validation |
|-------|-----------|------------|
| Picture | ImageCropInput | Optional, max 5MB, jpg/png/webp |
| First Name | FormInput | Required |
| Last Name | FormInput | Required |
| Race | FormInput | Optional |
| Class | FormInput | Optional |
| Age | FormInput (type="number") | Optional, positive integer |
| Location | FormInput | Optional |
| Link | FormInput (type="url") | Optional, validated as HTTP/HTTPS URL |
| Session Introduced | FormSelect | Optional, defaults to "No Session" |
| Sessions Appeared In | Multi-select chip input | Optional, select from campaign sessions |
| Notes | MarkdownEditor (Edit/Preview tabs) | Optional |
| GM Notes | MarkdownEditor (Edit/Preview tabs) | Optional, labeled "Only visible to GM" |
| Tags | TagAutocompleteInput | Optional |
| Visibility | Radio buttons (Private/Public) | Default: Private |

### "Sessions Appeared In"

Multi-select using chip input pattern: dropdown of campaign sessions, click to add, chips appear with X to remove. Similar UX to TagAutocompleteInput but sourced from sessions.

### Modes

- `characterId` undefined = create mode (blank form)
- `characterId` string = edit mode (fetches existing data, populates all fields)

### Delete

Same pattern as NoteModal — secondary button with confirmation step before action.

## Image Upload & Crop

### Upload Flow

1. User clicks upload area (shows current image circle or placeholder with camera icon)
2. File picker opens — accepts jpg, png, webp
3. Validation: max 5MB, immediate inline error if exceeded
4. Upload area shows guidance: "Recommended: 512×512px or larger. Max 5MB. JPG, PNG, or WebP."

### Crop Flow

1. After selecting a valid image, crop overlay appears
2. Image fills the background with a circular mask showing visible area
3. User can drag to pan and scroll/pinch to zoom
4. "Confirm" and "Cancel" buttons below the crop area
5. On confirm, crop region stored as `pictureCrop: { x, y, width, height }` (normalized 0-1 values)

### Implementation

- Use `react-easy-crop` library for the circular crop + drag/zoom UX
- Original image uploaded to storage; cropping applied client-side via CSS (`object-fit: cover` + `object-position`)
- No server-side image processing

### Display Sizes

- CharacterCard (wiki list): 48px circle
- CharacterWindow (GM Screen): 96px circle
- CharacterModal (edit form): crop preview

## Server Functions

Located at `app/server/functions/characters.ts`.

| Function | Method | Auth | Description |
|----------|--------|------|-------------|
| `listCharacters` | GET | Campaign member | Filters: campaignId, search, sessionId, visibility, tags. Session filter uses union: `{ $or: [{ sessionId }, { sessions: sessionId }] }`. Public chars visible to all; private only to creator. `gmNotes` stripped for non-GMs. Returns `CharacterListItem[]`. |
| `getCharacter` | GET | Campaign member | Full character with notes content. `gmNotes` stripped for non-GMs. Private chars only visible to creator. |
| `createCharacter` | POST | Campaign member | Zod-validated input. Returns full `CharacterData`. |
| `updateCharacter` | POST | Campaign member | Only creator can update. |
| `deleteCharacter` | POST | Campaign member | Only creator can delete. Cleans up GMScreen window references. |

### Search

Full-text search on `firstName`, `lastName`, `race`, `location`, `notes`, `gmNotes` using the MongoDB text index. Same `$text` query pattern as Notes.

## Hooks

Located at `app/hooks/useCharacters.ts`.

| Hook | Purpose | Query Key |
|------|---------|-----------|
| `useCharacters(campaignId, filters)` | List with filters | `queryKeys.characters.list(campaignId, ...)` |
| `useCharacter(id, campaignId)` | Single character detail | `queryKeys.characters.detail(id)` |
| `useCreateCharacter()` | Create mutation | Invalidates `characters.all`, `tags.all` |
| `useUpdateCharacter()` | Update mutation | Invalidates `characters.all`, detail, `gmscreens`, `tags.all` |
| `useDeleteCharacter()` | Delete mutation | Invalidates `characters.all`, `gmscreens` |

## GM Screen Integration

- Register `'character'` in `COLLECTION_REGISTRY` alongside `'note'`
- Hydration in `getGMScreen` already looks up documents by collection — add character lookup
- `CharacterWindow` component registered as the renderer for `collection: 'character'` windows
- Same drag payload pattern: `{ collection: 'character', documentId, title }`
- Duplicate detection: flash existing window if same character already open (same as Notes)

## Out of Scope

- Stack integration for characters (future feature)
- Refactoring NotesFilterWidget to use WikiFilterBar (can be done later)
- Additional wiki categories beyond Characters
- Server-side image resizing/optimization
