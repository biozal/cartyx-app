# UI Space Optimization Design

**Date:** 2026-04-05
**Scope:** Rules, Races, Characters, Notes windows and modals
**Goal:** Eliminate duplicated titles, consolidate visibility badges and tags into compact rows, move icons to title bars — reducing scroll in all content windows.

---

## Problem

Every content window (Rule, Race, Character) wastes 3–4 rows of vertical space:

1. The item title appears in the FloatingWindow title bar **and** again as an `h2` inside the window body.
2. The visibility badge (Public/Private with full text) occupies its own row.
3. Tags occupy a separate row.
4. The edit pencil button floats absolutely in the top-right corner.

This forces unnecessary scrolling to reach the actual content.

---

## Solution Overview

- Move the visibility icon (Globe/Lock) into the FloatingWindow title bar, before the title text.
- Move the character's external link icon into the title bar, after the title text.
- Remove the duplicate title `h2` from all window bodies.
- Remove the full-text visibility badge from all window bodies.
- Consolidate tags and the edit button into a single compact row at the top of the window body.
- Apply the same header improvements to view modals (RuleViewModal, RaceViewModal, CharacterViewModal) and NoteModal.

---

## Section 1: Data Layer

### `HydratedDocument` type (`app/types/gmscreen.ts`)

Add two optional fields:

```typescript
export interface HydratedDocument {
  id: string;
  collection: string;
  title: string;
  content: string;
  isPublic?: boolean; // rules and characters only
  link?: string; // characters only (external URL)
}
```

### Backend hydration endpoint

The server route that builds the `hydrated` map for `GMScreenDetailData` must populate `isPublic` and `link` when the collection supports them:

- `rule` collection → include `isPublic`
- `character` collection → include `isPublic` and `link`
- `race` collection → neither field (races have no visibility concept)

### `FloatingWindow` component (`app/components/mainview/FloatingWindow.tsx`)

Add two optional visual props (the `title: string` prop is unchanged and continues to drive all aria-labels):

```typescript
titleIcon?: ReactNode    // rendered before the title text (Globe/Lock)
titleSuffix?: ReactNode  // rendered after the title text (ExternalLink for characters)
```

Title bar layout becomes:

```
[titleIcon] [title text] [titleSuffix]     [minimize] [maximize] [close]
```

### `ManagedWindow` interface + `FloatingWindowManager`

`ManagedWindow` gains matching `titleIcon?: ReactNode` and `titleSuffix?: ReactNode` fields. `FloatingWindowManager` passes them straight through to `FloatingWindow`.

### `GMScreensView` — icon construction

When building each `ManagedWindow` from server data:

- **Rule:** `titleIcon = <Lock/Globe based on doc.isPublic>`
- **Character:** `titleIcon = <Lock/Globe based on doc.isPublic>`, `titleSuffix = <a href={doc.link}><ExternalLink /></a>` (omitted if `doc.link` is absent)
- **Race:** no `titleIcon`, no `titleSuffix`

---

## Section 2: Window Content Components

All three window components lose their header elements. Content starts immediately after a single compact meta row.

### Edit button — moved from Wrappers into Window components

Currently the Wrapper components (`RuleWindowWrapper`, `RaceWindowWrapper`, `CharacterWindowWrapper`) each render the edit pencil button as an absolutely-positioned overlay on top of the window body. To place it on the same row as the tags, the button must move inside the Window component itself.

Each Window component gains an optional `onEdit?: () => void` prop. When provided, the button renders inside the meta row. The Wrappers pass their existing `onEdit` callback through, and drop their own absolute-positioned button.

Visibility of the edit button follows existing logic:

- `RuleWindow`: renders when `isGM` is true (also add `isGM?: boolean` prop)
- `RaceWindow`: renders when `race.canEdit` is true (data already available)
- `CharacterWindow`: renders when `character.canEdit` is true (data already available)

### `RuleWindow` (`app/components/wiki/rules/RuleWindow.tsx`)

**Remove:**

- Title `h2`
- Full-width visibility badge div

**Add:**

- `onEdit?: () => void` and `isGM?: boolean` props
- Single compact row at the top: tags on the left, edit pencil button on the right (only when `isGM`)
- Reduced top padding so content follows closely

```
[#rules] [#magic]                              [✏]
────────────────────────────────────────────────
### Setting a DC
...
```

The row is omitted entirely if there are no tags and no edit button.

### `RaceWindow` (`app/components/wiki/races/RaceWindow.tsx`)

**Remove:**

- Title `h2`
- Separate tags div (currently in the header section)

**Add:**

- `onEdit?: () => void` prop
- Same compact tags + edit button row as RuleWindow (button shown when `race.canEdit`)
- Races have no visibility badge to remove

### `CharacterWindow` (`app/components/wiki/characters/CharacterWindow.tsx`)

**Remove:**

- Name `h2` + external link row (both move to the FloatingWindow/modal title bar)
- Standalone visibility badge div

**Add:**

- `onEdit?: () => void` prop

**Reorganize:**

- Tags move to directly below the portrait, in a compact centered flex row, with the edit button on the right (shown when `character.canEdit`)
- Stats grid follows below tags
- Accordions unchanged

```
          [portrait]
    [#guard] [#dwarf]           [✏]
┌──────────┬──────────┐
│ Race     │ Age      │
│ Dwarf    │ 208      │
└──────────┴──────────┘
▶ Details
▶ GM Notes
```

---

## Section 3: View Modals & NoteModal

### `RuleViewModal` (`app/components/wiki/rules/RuleViewModal.tsx`)

The modal already fetches `rule` via `useRule`. Once loaded:

- Header shows: `[Lock/Globe icon]  {rule.title}` instead of the generic "Rule"
- During loading: falls back to "Rule"
- The `RuleWindow` body (compact row + content) renders unchanged

### `RaceViewModal` (`app/components/wiki/races/RaceViewModal.tsx`)

- Header shows: `{race.title}` (no icon — races have no visibility)
- During loading: falls back to "Race"

### `CharacterViewModal` (`app/components/wiki/characters/CharacterViewModal.tsx`)

The modal fetches `character` via `useCharacter`. Once loaded:

- Header shows: `[Lock/Globe icon]  {character.firstName} {character.lastName}  [ExternalLink icon]`
- ExternalLink icon is an `<a>` linking to `character.link` (omitted if absent)
- During loading: falls back to "Character"

### `NoteModal` (`app/components/mainview/notes/NoteModal.tsx`)

`isPublic` is already tracked as local state. The modal header gets a Globe or Lock icon prepended, driven by that state. It updates live as the user toggles the visibility radio buttons.

- Creating: `[Lock icon]  Create Note` (default: private)
- Editing: `[Globe/Lock icon]  Edit Note` (reflects loaded visibility, updates on toggle)

---

## Files Changed

| File                                                           | Change                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------- |
| `app/types/gmscreen.ts`                                        | Add `isPublic?`, `link?` to `HydratedDocument`                      |
| `server/` (hydration route)                                    | Include `isPublic` and `link` in hydrated data                      |
| `app/components/mainview/FloatingWindow.tsx`                   | Add `titleIcon`, `titleSuffix` props                                |
| `app/components/mainview/FloatingWindowManager.tsx`            | Thread new props through                                            |
| `app/components/mainview/gmscreens/GMScreensView.tsx`          | Build and pass icons from hydrated data                             |
| `app/components/wiki/rules/RuleWindow.tsx`                     | Remove title/badge, add compact meta row, add `onEdit`/`isGM` props |
| `app/components/mainview/gmscreens/RuleWindowWrapper.tsx`      | Pass `onEdit`/`isGM` to `RuleWindow`, remove absolute edit button   |
| `app/components/wiki/races/RaceWindow.tsx`                     | Remove title, add compact meta row, add `onEdit` prop               |
| `app/components/wiki/races/RaceWindowWrapper.tsx`              | Pass `onEdit` to `RaceWindow`, remove absolute edit button          |
| `app/components/wiki/characters/CharacterWindow.tsx`           | Remove title/badge/link, move tags, add `onEdit` prop               |
| `app/components/mainview/gmscreens/CharacterWindowWrapper.tsx` | Pass `onEdit` to `CharacterWindow`, remove absolute edit button     |
| `app/components/wiki/rules/RuleViewModal.tsx`                  | Show actual title + icon in header                                  |
| `app/components/wiki/races/RaceViewModal.tsx`                  | Show actual title in header                                         |
| `app/components/wiki/characters/CharacterViewModal.tsx`        | Show actual title + icons in header                                 |
| `app/components/mainview/notes/NoteModal.tsx`                  | Add live visibility icon to header                                  |

---

## Out of Scope

- Edit modals (RuleModal, RaceModal, CharacterModal) — their headers are form titles ("Edit Rule" etc.) and are fine as-is.
- The FloatingWindowTray (minimized window list) — uses `title: string` only, unaffected.
- Card components (RuleCard, RaceCard, CharacterCard) — already compact, not part of this request.
