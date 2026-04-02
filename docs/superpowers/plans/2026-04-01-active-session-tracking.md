# Active Session Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `isActive` boolean to the Session model so exactly one session per campaign can be marked active, with automatic deactivation of the previous active session.

**Architecture:** Add `isActive` field to the Mongoose Session schema with a compound index. Update `createCampaign` to set Session 0 as active. Add an `activateSession` server function that atomically deactivates the current active session (setting its `endDate`) and activates the target session, all within a MongoDB transaction.

**Tech Stack:** MongoDB/Mongoose, TanStack Start server functions, Vitest, Zod

---

### Task 1: Add `isActive` field to Session schema

**Files:**
- Modify: `app/server/db/models/Session.ts`

- [ ] **Step 1: Add `isActive` field to the schema**

In `app/server/db/models/Session.ts`, add `isActive` to the schema definition. Insert after line 9 (`endDate`):

```typescript
const sessionSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
  name: { type: String, required: true },
  gm: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  number: { type: Number, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  isActive: { type: Boolean, default: false },
  summary: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})
```

- [ ] **Step 2: Add compound index for active session lookup**

Add the new index inside the existing `if` block (after line 18):

```typescript
// istanbul ignore next
if (typeof (sessionSchema as { index?: unknown }).index === 'function') {
  sessionSchema.index({ campaignId: 1, number: -1 })
  sessionSchema.index({ campaignId: 1, startDate: -1 })
  sessionSchema.index({ campaignId: 1, isActive: 1 })
}
```

- [ ] **Step 3: Commit**

```bash
git add app/server/db/models/Session.ts
git commit -m "feat: add isActive field and index to Session schema"
```

---

### Task 2: Update `createCampaign` to set Session 0 as active

**Files:**
- Modify: `app/server/functions/campaigns.ts:387-394`
- Test: `tests/server/functions/campaigns.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/server/functions/campaigns.test.ts`, add a new test in the `createCampaign` describe block (after the existing "creates a default Session 0 document" test around line 512):

```typescript
  it('creates Session 0 with isActive set to true', async () => {
    const created = makeCampaign()
    vi.mocked(Campaign.create).mockResolvedValue([created] as never)

    await _createCampaign({ data: { name: 'My Campaign', description: '' } })

    expect(Session.create).toHaveBeenCalledWith(
      [expect.objectContaining({
        campaignId: 'camp-1',
        name: 'Session 0',
        isActive: true,
      })],
      expect.objectContaining({ session: expect.anything() })
    )
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/functions/campaigns.test.ts -t "creates Session 0 with isActive set to true"`

Expected: FAIL — `isActive` is not in the Session.create call yet.

- [ ] **Step 3: Update `createCampaign` to pass `isActive: true`**

In `app/server/functions/campaigns.ts`, update the Session.create call at lines 387-394. Add `isActive: true`:

```typescript
            Session.create([{
              campaignId: campaign._id,
              name: 'Session 0',
              gm: dbUser._id,
              number: 0,
              startDate: now,
              endDate: null,
              isActive: true,
            }], { session: mongoSession }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/functions/campaigns.test.ts -t "creates Session 0 with isActive set to true"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/server/functions/campaigns.ts tests/server/functions/campaigns.test.ts
git commit -m "feat: set Session 0 as active when creating a campaign"
```

---

### Task 3: Update `CampaignData` type and `getCampaign` to include `isActive`

**Files:**
- Modify: `app/server/functions/campaigns.ts:33-38` (CampaignData interface) and `app/server/functions/campaigns.ts:202-205` (getCampaign query projection) and `app/server/functions/campaigns.ts:224-230` (session serialization)
- Test: `tests/server/functions/campaigns.test.ts`

- [ ] **Step 1: Write the failing test**

Add a new test in the `getCampaign` describe block (near the existing session serialization tests around line 987):

```typescript
  it('includes isActive in serialized session data', async () => {
    const campaign = makeCampaign()
    vi.mocked(Campaign.findById).mockResolvedValue(campaign)
    const sessionDocs = [
      { _id: 'sess-0', name: 'Session 0', number: 0, startDate: new Date('2026-01-01'), endDate: null, isActive: true },
      { _id: 'sess-1', name: 'Session 1', number: 1, startDate: new Date('2026-01-08'), endDate: new Date('2026-01-08T23:00:00Z'), isActive: false },
    ]
    vi.mocked(Session.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(sessionDocs) }),
    } as never)

    const result = await _getCampaign({ data: { id: 'camp-1' } }) as {
      sessions: Array<{ id: string; isActive: boolean }>
    }

    expect(result.sessions[0].isActive).toBe(true)
    expect(result.sessions[1].isActive).toBe(false)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/functions/campaigns.test.ts -t "includes isActive in serialized session data"`

Expected: FAIL — `isActive` is not in the query projection or serialization.

- [ ] **Step 3: Update the `CampaignData` interface**

In `app/server/functions/campaigns.ts`, update the sessions type in the `CampaignData` interface (around line 33-38):

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

- [ ] **Step 4: Update the `getCampaign` query projection**

In `app/server/functions/campaigns.ts`, update the Session.find projection (line 204) to include `isActive`:

```typescript
        Session.find(
          { campaignId: c._id },
          '_id name number startDate endDate isActive'
        ).sort({ number: 1 }).lean(),
```

- [ ] **Step 5: Update the session serialization**

In `app/server/functions/campaigns.ts`, update the session mapping (around lines 224-230) to include `isActive`:

```typescript
      const sessions = (sessionDocs as Array<{ _id: unknown; name: unknown; number: unknown; startDate: unknown; endDate: unknown; isActive: unknown }>).map(s => ({
        id: String(s._id),
        name: s.name as string,
        number: s.number as number,
        startDate: (s.startDate as Date).toISOString(),
        endDate: s.endDate ? (s.endDate as Date).toISOString() : null,
        isActive: Boolean(s.isActive),
      }))
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/server/functions/campaigns.test.ts -t "includes isActive in serialized session data"`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/server/functions/campaigns.ts tests/server/functions/campaigns.test.ts
git commit -m "feat: include isActive in CampaignData session type and getCampaign"
```

---

### Task 4: Update mock sessions service to include `isActive`

**Files:**
- Modify: `app/services/mocks/sessionsService.ts`

- [ ] **Step 1: Add `isActive` to mock session data**

Since `Session` type is derived from `CampaignData['sessions'][number]`, it will now require `isActive`. Update `app/services/mocks/sessionsService.ts` — set the first mock session (session-14) as active, all others inactive:

```typescript
export const mockSessions: ReadonlyArray<Readonly<Session>> = Object.freeze([
  Object.freeze({
    id: 'session-14',
    number: 14,
    name: 'Ashes at Emberfall',
    startDate: '2026-03-21T00:00:00.000Z',
    endDate: null,
    isActive: true,
  }),
  Object.freeze({
    id: 'session-13',
    number: 13,
    name: 'The Bell Beneath the Chapel',
    startDate: '2026-03-14T00:00:00.000Z',
    endDate: null,
    isActive: false,
  }),
  Object.freeze({
    id: 'session-12',
    number: 12,
    name: 'Smoke Over Glassmere',
    startDate: '2026-03-07T00:00:00.000Z',
    endDate: null,
    isActive: false,
  }),
  Object.freeze({
    id: 'session-11',
    number: 11,
    name: 'A Crown of Hollow Iron',
    startDate: '2026-02-28T00:00:00.000Z',
    endDate: null,
    isActive: false,
  }),
  Object.freeze({
    id: 'session-10',
    number: 10,
    name: 'The Silent Lantern',
    startDate: '2026-02-21T00:00:00.000Z',
    endDate: null,
    isActive: false,
  }),
  Object.freeze({
    id: 'session-9',
    number: 9,
    name: 'Blackwater Oaths',
    startDate: '2026-02-14T00:00:00.000Z',
    endDate: null,
    isActive: false,
  }),
  Object.freeze({
    id: 'session-8',
    number: 8,
    name: 'Teeth in the Snow',
    startDate: '2026-02-07T00:00:00.000Z',
    endDate: null,
    isActive: false,
  }),
  Object.freeze({
    id: 'session-7',
    number: 7,
    name: 'The Cartographer\'s Debt',
    startDate: '2026-01-31T00:00:00.000Z',
    endDate: null,
    isActive: false,
  }),
])
```

- [ ] **Step 2: Run all tests to verify nothing is broken**

Run: `npx vitest run`

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/services/mocks/sessionsService.ts
git commit -m "feat: add isActive field to mock session data"
```

---

### Task 5: Add `activateSession` server function

**Files:**
- Modify: `app/server/functions/campaigns.ts`
- Test: `tests/server/functions/campaigns.test.ts`

- [ ] **Step 1: Add `findOne` and `updateOne` to the Session mock**

In `tests/server/functions/campaigns.test.ts`, update the Session mock (line 98-103) to include `findOne` and `updateOne`:

```typescript
vi.mock('~/server/db/models/Session', () => ({
  Session: {
    find: vi.fn().mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }),
    findOne: vi.fn().mockReturnValue({ session: vi.fn().mockReturnValue(null) }),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    create: vi.fn(),
  },
}))
```

Also add `Session.findOne` and `Session.updateOne` resets in `beforeEach` (around line 167-168):

```typescript
  vi.mocked(Session.findOne).mockReturnValue({ session: vi.fn().mockReturnValue(null) } as never)
  vi.mocked(Session.updateOne).mockResolvedValue({ modifiedCount: 1 } as never)
```

Update the `_activateSession` cast (after line 181):

```typescript
const _activateSession = activateSession as unknown as (args: { data: { campaignId: string; sessionId: string; endDate?: string } }) => Promise<unknown>
```

Update the import on line 126 to include `activateSession`:

```typescript
import { listCampaigns, getCampaign, createCampaign, updateCampaign, joinCampaign, activateSession, campaignInputSchema } from '~/server/functions/campaigns'
```

- [ ] **Step 2: Write the failing tests**

Add a new `describe('activateSession', ...)` block at the end of the test file:

```typescript
describe('activateSession', () => {
  it('deactivates the current active session and activates the target session', async () => {
    const campaign = makeCampaign()
    vi.mocked(Campaign.findById).mockResolvedValue(campaign)
    vi.mocked(Session.findOne).mockReturnValue({
      session: vi.fn().mockResolvedValue({ _id: 'sess-old', campaignId: 'camp-1', isActive: true }),
    } as never)

    const result = await _activateSession({ data: { campaignId: 'camp-1', sessionId: 'sess-new' } })

    expect(result).toMatchObject({ success: true })

    // Should deactivate old session
    expect(Session.updateOne).toHaveBeenCalledWith(
      { _id: 'sess-old' },
      { $set: { isActive: false, endDate: expect.any(Date), updatedAt: expect.any(Date) } },
      expect.objectContaining({ session: expect.anything() })
    )

    // Should activate new session
    expect(Session.updateOne).toHaveBeenCalledWith(
      { _id: 'sess-new', campaignId: 'camp-1' },
      { $set: { isActive: true, updatedAt: expect.any(Date) } },
      expect.objectContaining({ session: expect.anything() })
    )
  })

  it('uses GM-provided endDate when supplied', async () => {
    const campaign = makeCampaign()
    vi.mocked(Campaign.findById).mockResolvedValue(campaign)
    vi.mocked(Session.findOne).mockReturnValue({
      session: vi.fn().mockResolvedValue({ _id: 'sess-old', campaignId: 'camp-1', isActive: true }),
    } as never)

    await _activateSession({ data: { campaignId: 'camp-1', sessionId: 'sess-new', endDate: '2026-03-15T22:00:00.000Z' } })

    expect(Session.updateOne).toHaveBeenCalledWith(
      { _id: 'sess-old' },
      { $set: { isActive: false, endDate: new Date('2026-03-15T22:00:00.000Z'), updatedAt: expect.any(Date) } },
      expect.objectContaining({ session: expect.anything() })
    )
  })

  it('activates session even when no currently active session exists', async () => {
    const campaign = makeCampaign()
    vi.mocked(Campaign.findById).mockResolvedValue(campaign)
    vi.mocked(Session.findOne).mockReturnValue({
      session: vi.fn().mockResolvedValue(null),
    } as never)

    const result = await _activateSession({ data: { campaignId: 'camp-1', sessionId: 'sess-new' } })

    expect(result).toMatchObject({ success: true })

    // Should only activate the new session (one updateOne call, not two)
    expect(Session.updateOne).toHaveBeenCalledTimes(1)
    expect(Session.updateOne).toHaveBeenCalledWith(
      { _id: 'sess-new', campaignId: 'camp-1' },
      { $set: { isActive: true, updatedAt: expect.any(Date) } },
      expect.objectContaining({ session: expect.anything() })
    )
  })

  it('throws when user is not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null)

    await expect(
      _activateSession({ data: { campaignId: 'camp-1', sessionId: 'sess-1' } })
    ).rejects.toThrow('Not authenticated')
  })

  it('throws when user is not the campaign GM', async () => {
    const campaign = makeCampaign({ gameMasterId: 'someone-else' })
    vi.mocked(Campaign.findById).mockResolvedValue(campaign)

    await expect(
      _activateSession({ data: { campaignId: 'camp-1', sessionId: 'sess-1' } })
    ).rejects.toThrow('Forbidden')
  })

  it('skips deactivation when the target session is already the active session', async () => {
    const campaign = makeCampaign()
    vi.mocked(Campaign.findById).mockResolvedValue(campaign)
    vi.mocked(Session.findOne).mockReturnValue({
      session: vi.fn().mockResolvedValue({ _id: 'sess-1', campaignId: 'camp-1', isActive: true }),
    } as never)

    const result = await _activateSession({ data: { campaignId: 'camp-1', sessionId: 'sess-1' } })

    expect(result).toMatchObject({ success: true })
    // No updates needed — it's already active
    expect(Session.updateOne).not.toHaveBeenCalled()
  })

  it('ends the mongo session even when the transaction fails', async () => {
    const campaign = makeCampaign()
    vi.mocked(Campaign.findById).mockResolvedValue(campaign)
    vi.mocked(Session.findOne).mockReturnValue({
      session: vi.fn().mockResolvedValue({ _id: 'sess-old', campaignId: 'camp-1', isActive: true }),
    } as never)
    vi.mocked(Session.updateOne).mockRejectedValue(new Error('DB write failed'))

    await expect(
      _activateSession({ data: { campaignId: 'camp-1', sessionId: 'sess-new' } })
    ).rejects.toThrow()

    expect(mockMongoSession.endSession).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/server/functions/campaigns.test.ts -t "activateSession"`

Expected: FAIL — `activateSession` is not exported from campaigns.ts yet.

- [ ] **Step 4: Implement `activateSession` server function**

In `app/server/functions/campaigns.ts`, add the following after the `joinCampaign` export (after line 592):

```typescript
export const activateSession = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    campaignId: z.string().min(1),
    sessionId: z.string().min(1),
    endDate: z.string().datetime().optional(),
  }))
  .handler(async ({ data }) => {
    const user = await getSession()
    try {
      if (!user) throw new Error('Not authenticated')

      await connectDB()
      if (!isDBConnected()) throw new Error('Database not available')

      const dbUser = await User.findOne({ providerId: user.id })
      if (!dbUser) throw new Error('User not found')

      const campaign = await Campaign.findById(data.campaignId)
      if (!campaign) throw new Error('Campaign not found')
      if (String(campaign.gameMasterId) !== String(dbUser._id)) throw new Error('Forbidden')

      const mongoSession = await mongoose.startSession()
      try {
        await mongoSession.withTransaction(async () => {
          const currentActive = await Session.findOne({ campaignId: data.campaignId, isActive: true }).session(mongoSession)

          // If the target is already the active session, no-op
          if (currentActive && String(currentActive._id) === data.sessionId) {
            return
          }

          const now = new Date()

          // Deactivate the currently active session
          if (currentActive) {
            const endDate = data.endDate ? new Date(data.endDate) : now
            await Session.updateOne(
              { _id: currentActive._id },
              { $set: { isActive: false, endDate, updatedAt: now } },
              { session: mongoSession }
            )
          }

          // Activate the target session
          await Session.updateOne(
            { _id: data.sessionId, campaignId: data.campaignId },
            { $set: { isActive: true, updatedAt: now } },
            { session: mongoSession }
          )
        })
      } finally {
        await mongoSession.endSession()
      }

      return { success: true }
    } catch (e) {
      serverCaptureException(e, user?.id, { action: 'activateSession', campaignId: data.campaignId, sessionId: data.sessionId })
      throw e
    }
  })
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/server/functions/campaigns.test.ts -t "activateSession"`

Expected: All 7 activateSession tests PASS.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/server/functions/campaigns.ts tests/server/functions/campaigns.test.ts
git commit -m "feat: add activateSession server function with transaction safety"
```
