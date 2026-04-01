# Active Session Tracking

## Problem

Sessions have no concept of being "active." When a campaign is created, Session 0 is injected but nothing marks it as the current session. Game Masters need a way to designate one session as active per campaign, with automatic deactivation of the previous session when a new one is activated.

## Design

### Schema Change: Session Model

Add an `isActive` boolean field to the Session Mongoose schema in `app/server/db/models/Session.ts`:

```typescript
isActive: { type: Boolean, default: false }
```

Add a compound index for efficient active session lookup:

```typescript
sessionSchema.index({ campaignId: 1, isActive: 1 })
```

### Campaign Creation Update

In `app/server/functions/campaigns.ts`, update the `createCampaign` function so that Session 0 is created with `isActive: true`:

```typescript
Session.create([{
  campaignId: campaign._id,
  name: 'Session 0',
  gm: dbUser._id,
  number: 0,
  startDate: now,
  endDate: null,
  isActive: true,
}], { session: mongoSession })
```

### Activation Logic: `activateSession` Function

Add a new server function `activateSession` in `app/server/functions/campaigns.ts` (or a new `sessions.ts` file if preferred). The function accepts:

- `campaignId`: The campaign the session belongs to
- `sessionId`: The session to activate
- `endDate` (optional): The end date for the currently active session. Defaults to `new Date()` if not provided.

Within a MongoDB transaction:

1. **Find the currently active session** for the campaign: `Session.findOne({ campaignId, isActive: true })`
2. **Deactivate it** (if found and it's not the same session being activated): set `isActive: false` and `endDate` to the provided date or `new Date()`
3. **Activate the target session**: set `isActive: true`

The transaction ensures atomicity — there is never a state where zero or two sessions are active within a campaign.

Authorization: Only users with the `gm` role for the campaign can activate sessions.

### Type Updates

In the `CampaignData` interface in `app/server/functions/campaigns.ts`, add `isActive` to the session shape:

```typescript
sessions: Array<{
  id: string
  name: string
  number: number
  startDate: string
  endDate: string | null
  isActive: boolean
}>
```

Update the `getCampaign` function's Session query projection to include `isActive`.

### Session Creation Rules

- `startDate` is automatically set to the current date/time at creation. It is not editable.
- `isActive` defaults to `false`. The GM can optionally mark a session as active at creation time (via a checkbox in a future UI).
- If marked active at creation, the deactivation flow runs first (same as `activateSession`).

### Test Updates

In `tests/server/functions/campaigns.test.ts`:

1. **Update existing tests**: Verify Session 0 is created with `isActive: true`
2. **New tests for `activateSession`**:
   - Activating a session deactivates the previously active session (`isActive: false`, `endDate` set)
   - GM-provided `endDate` is used when supplied
   - `endDate` defaults to current date when not supplied
   - Activating an already-active session is a no-op (no error, no changes)
   - Only GMs can activate sessions (authorization check)
   - Transaction rolls back on failure (no partial state)
   - Only one session is active per campaign at any time

## Out of Scope

- Session creation UI / editor (future work)
- Session editing UI (future work)
- Displaying active session status in the UI (future work)
