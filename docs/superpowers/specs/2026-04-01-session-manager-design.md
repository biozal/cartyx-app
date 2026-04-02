# Session Manager Design

## Overview

A session management feature for game masters to manage campaign sessions. Adds active session visibility to the CampaignHeader and a dedicated management page for creating, editing, and activating sessions.

## CampaignHeader Changes

Current layout: `CARTYX` (left) | `Tabs` (center) | `Bell + UserMenu` (right).

New layout adds active session info to the left section:

```
[ CARTYX  Session 61 [gear] ]  [  Dashboard | Tabletop  ]  [ Bell UserMenu ]
```

- Active session name in `#2563EB` (blue brand color), `text-xs` to match CARTYX sizing
- `faGear` icon button next to the session name, `slate-400` with hover brightening, navigates to `/campaigns/$campaignId/sessions`
- GM-only: both session name and gear icon only render when `isOwner` is true
- No active session: show "No Session" in muted color, gear icon still available
- Only visible on the play route where `campaignId` is available

## Session Management Page

### Route

`/campaigns/$campaignId/sessions` — GM-only, redirects to play if not the GM.

### Layout

- Dark background (`#080A12`) consistent with existing pages
- Header area: back link to play view, page title "Sessions", "New Session" button
- Vertical card list (full-width rows, not a grid)

### Session Cards

- Display: name, start date, end date (or "In Progress")
- Active session highlighted with left border or background tint using `#2563EB`
- Non-active incomplete sessions show an "Activate" button
- Clicking a card (not the activate button) opens the edit modal

### Filtering

- Default: show incomplete sessions only (no `endDate`)
- Toggle: "Show completed sessions" — completed sessions appear below incomplete ones in muted style

### New Session Modal

- Fields: Name (text, required), Start Date (date picker, required)
- Session created as inactive with no `endDate`
- Session `number` auto-assigned as next sequential integer

### Edit Session Modal

- Same form as create, pre-populated
- Fields: Name, Start Date, End Date (optional — allows manual correction)
- Save/Cancel buttons

### Activation Flow

1. GM clicks "Activate" on an incomplete, non-active session
2. Confirmation prompt: "Activating this session will complete the current active session. Continue?"
3. On confirm: transaction deactivates current session (sets `endDate` to now), activates selected session
4. If no current active session, just activates the selected session directly

## Data Layer

### Existing Infrastructure (reused as-is)

- `Session` model with `isActive`, `endDate`, unique partial index on `{ campaignId, isActive }` where `isActive: true`
- `activateSession` server function with transaction support
- `getCampaign` already returns sessions with `isActive` flag (used for header display)

### New Server Functions

- **`listSessions(campaignId, includeCompleted?)`** — returns sessions filtered by completion status, sorted by `startDate` descending
- **`createSession(campaignId, name, startDate)`** — creates inactive session, auto-assigns next `number`
- **`updateSession(sessionId, { name?, startDate?, endDate? })`** — updates session fields

All new functions validate that the requesting user is the campaign GM.

### Header Data

No new query needed. The active session is derived from the existing campaign data returned by `getCampaign` (find session where `isActive` is true).

## Access Control

- All session management endpoints verify `isOwner`
- Route redirects non-GMs to play view
- Non-GMs never see gear icon or session name in header

## Edge Cases

- **No sessions exist** — empty state with prompt to create first session
- **No active session** — header shows "No Session" muted; activation works without deactivation step
- **Concurrent activation** — unique partial index guarantees only one active session at the database level
- **Session naming** — no constraints on naming convention; GMs can use "Session 61", "The Fall of Blackmoor", etc. Name + dates provide sufficient identification
