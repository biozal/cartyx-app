# Wiki Rules Feature — Design Spec

**Date:** 2026-04-05
**Status:** Approved

## Overview

Add a "Rules" feature to the Wiki system. Rules are custom text entries (stored as markdown) that Game Masters can create, edit, and delete. Rules can be public (visible to all campaign members) or private (GM-only). Players see rendered HTML for public rules — never raw markdown.

Rules have no session association and never will.

## Data Model

### Rule Schema (Mongoose)

```
Rule {
  _id: ObjectId
  title: String (required)
  content: String (markdown, required)
  tags: [String] (normalized lowercase, deduplicated, trimmed)
  isPublic: Boolean (default: false)
  campaignId: ObjectId (required)
  createdBy: ObjectId (User reference, required)
  createdAt: Date (default: Date.now)
  updatedAt: Date (auto-updated on save/update)
}
```

### Indexes

- `{ campaignId: 1, updatedAt: -1 }` — list queries sorted by recent
- `{ campaignId: 1 }` — base campaign filter
- `{ tags: 1 }` — tag filtering
- `{ isPublic: 1 }` — visibility filtering
- `{ createdBy: 1 }` — creator lookup
- Full-text index on `title`, `content` — search

### Pre-save Hooks

- Normalize tags (lowercase, deduplicate, trim) — same pattern as Character/Note models
- Auto-update `updatedAt` timestamp

## API Layer

Five TanStack Start server functions mirroring the Notes pattern.

### Permission Model

- **Create/Edit/Delete:** Any campaign GM (`requireCampaignGM`). No per-creator restrictions — any GM can edit or delete any rule.
- **List:** GMs see all rules. Players see public rules only.
- **Detail:** GMs see any rule. Players see public rules only. Non-public rules return null for non-GMs.

### Server Functions

#### `listRules`

- **Method:** GET
- **Input:** `campaignId`, `search?`, `visibility: 'all' | 'public' | 'private'`, `tags?: string[]`
- **Returns:** `RuleListItem[]` (id, title, tags, isPublic, createdAt, updatedAt — no content)
- **Permission:** Campaign members. GMs see all rules; players see only public rules (visibility filter constrained to 'public' for non-GMs).

#### `getRule`

- **Method:** GET
- **Input:** `id`, `campaignId`
- **Returns:** `RuleData | null`
- **Permission:** Campaign members. GMs see any rule. Players see public rules only; non-public returns null.

#### `createRule`

- **Method:** POST
- **Input:** `campaignId`, `title`, `content`, `tags?: string[]`, `isPublic?: boolean`
- **Returns:** `{ success: true, rule: RuleData }`
- **Permission:** GM-only (`requireCampaignGM`)
- **Side effects:** Auto-registers tags via `ensureTags`. PostHog event: `rule_created`.

#### `updateRule`

- **Method:** POST
- **Input:** `id`, `campaignId`, `title`, `content`, `tags?: string[]`, `isPublic?: boolean`
- **Returns:** `{ success: true, rule: RuleData }`
- **Permission:** GM-only. Any GM can edit any rule.
- **Side effects:** Invalidates GM screen windows displaying this rule. PostHog event: `rule_updated`.

#### `deleteRule`

- **Method:** POST
- **Input:** `id`, `campaignId`
- **Returns:** `{ success: true }`
- **Permission:** GM-only. Any GM can delete any rule.
- **Side effects:** Removes rule references from all GM screens. PostHog event: `rule_deleted`.

### Response Serialization

- `serializeRule(doc)` — Full rule with content
- `serializeRuleListItem(doc)` — Rule without content (for list views)

## Types & Validation

### Type File: `types/rule.ts`

- `RuleData` — full rule including content
- `RuleListItem` — list item without content

### Schema File: `types/schemas/rules.ts`

Zod schemas for all five server function inputs, mirroring `types/schemas/notes.ts`.

## Frontend — Wiki Integration

### Wiki Panel

Add "Rules" as a new category in `WikiPanel.tsx` alongside Characters. Clicking "Rules" renders a `RulesPanel` component.

### RulesPanel (`components/wiki/rules/RulesPanel.tsx`)

- Uses `WikiFilterBar` for search, visibility toggle, and tag filtering
- **No session filter** — Rules are session-independent
- `WikiFilterBar` needs a `showSessionFilter?: boolean` prop (default `true`) to hide the session dropdown for Rules. RulesPanel passes `showSessionFilter={false}`.
- Lists `RuleCard` components
- Loading, error, and empty states

### RuleCard (`components/wiki/rules/RuleCard.tsx`)

- Displays: title, tags, public/private icon
- Draggable using `application/x-cartyx-document` MIME type: `{ collection: 'rule', documentId, title }`
- Click behavior:
  - GM → opens `RuleModal` (editor)
  - Player → opens `RuleViewModal` (read-only rendered markdown)

### RuleModal (`components/wiki/rules/RuleModal.tsx`)

Editor modal for GMs:

- Title text input (required)
- `MarkdownEditor` component for content (existing CodeMirror component)
- `TagAutocompleteInput` for tags (existing component)
- Public/Private toggle with icons
- Save and Delete buttons
- Delete confirmation dialog

### RuleViewModal (`components/wiki/rules/RuleViewModal.tsx`)

Read-only modal for players:

- Title display
- Fully rendered markdown content as HTML
- Tags display
- Close button

## GM Screen Integration

### GMScreen Model Update

The `windows[].collection` field accepts `'rule'` in addition to `'character'` and `'note'`.

### RuleWindowWrapper (`components/mainview/gmscreens/RuleWindowWrapper.tsx`)

- Loads rule via `useRule` hook
- Renders inside `FloatingWindow` — gets minimize, maximize, close, drag, resize, and position/size persistence for free
- Shows edit button if user is a GM (opens `RuleModal`)
- Window state (`x`, `y`, `width`, `height`, `zIndex`, `state`) persisted via GMScreen model

### RuleWindow (`components/wiki/rules/RuleWindow.tsx`)

- Renders rule title and fully rendered markdown content
- Scrollable container for variable-length content
- Same styling approach as `CharacterWindow`

### Drop Handling

The existing drop handler in `GMScreensView.tsx` parses `application/x-cartyx-document` payload. It needs to accept `collection: 'rule'` as a valid type and render `RuleWindowWrapper` for rule windows.

### Live Updates

When a rule is edited via `updateRule`, React Query invalidation on `rules.detail` and `gmscreens` query keys causes the GM screen window to re-render with updated content — same mechanism as Characters/Notes.

## React Query Hooks & Cache Keys

### Query Keys (`utils/queryKeys.ts`)

- `rules.list(campaignId, search?, visibility?, tags?)` — list cache key
- `rules.detail(id, campaignId)` — single rule cache key

### Hook File: `hooks/useRules.ts`

- `useRules()` — list query with filter params
- `useRule(id)` — single rule detail query
- `useCreateRule()` — mutation, invalidates list + tags
- `useUpdateRule()` — mutation, invalidates list + detail + gmscreens
- `useDeleteRule()` — mutation, invalidates list + gmscreens

## Files to Create

1. `app/server/db/models/Rule.ts` — Mongoose model
2. `app/server/functions/rules.ts` — Server functions
3. `app/types/rule.ts` — TypeScript types
4. `app/types/schemas/rules.ts` — Zod validation schemas
5. `app/hooks/useRules.ts` — React Query hooks
6. `app/components/wiki/rules/RulesPanel.tsx` — Wiki list panel
7. `app/components/wiki/rules/RuleCard.tsx` — List item card
8. `app/components/wiki/rules/RuleModal.tsx` — Editor modal
9. `app/components/wiki/rules/RuleViewModal.tsx` — Read-only modal
10. `app/components/wiki/rules/RuleWindow.tsx` — GM screen display
11. `app/components/mainview/gmscreens/RuleWindowWrapper.tsx` — GM screen wrapper

## Files to Modify

1. `app/components/wiki/WikiPanel.tsx` — Add "Rules" category
2. `app/components/wiki/shared/WikiFilterBar.tsx` — Add `showSessionFilter` prop to optionally hide session dropdown
3. `app/components/mainview/gmscreens/GMScreensView.tsx` — Handle 'rule' collection in drop handler and window rendering
4. `app/server/db/models/GMScreen.ts` — Accept 'rule' in collection enum
5. `app/utils/queryKeys.ts` — Add rules query keys
6. `app/types/gmscreen.ts` — Update collection type to include 'rule'
