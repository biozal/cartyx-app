# Session Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a session management feature that shows the active session in the CampaignHeader with a gear icon linking to a dedicated GM-only session management page.

**Architecture:** New server functions for session CRUD in a dedicated `sessions.ts` file. A new route at `/campaigns/$campaignId/sessions` renders the management page. CampaignHeader is extended with active session name + gear icon (GM-only). React Query hooks in a new `useSessions.ts` manage client-side state. Modals reuse existing `FormInput`, `PixelButton`, and portal patterns from `NoteModal`.

**Tech Stack:** TanStack React Start, TanStack React Router, React Query, Mongoose (MongoDB), Zod, Vitest, React Testing Library, Tailwind CSS, FontAwesome Pro

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `app/server/functions/sessions.ts` | Server functions: listSessions, createSession, updateSession |
| Create | `app/hooks/useSessions.ts` | React Query hooks for session CRUD + activation |
| Create | `app/components/sessions/SessionModal.tsx` | Create/edit session modal |
| Create | `app/routes/campaigns/$campaignId/sessions.tsx` | Session management page route |
| Modify | `app/components/mainview/CampaignHeader.tsx` | Add active session name + gear icon |
| Modify | `app/utils/queryKeys.ts` | Add session query keys |
| Create | `tests/server/functions/sessions.test.ts` | Server function tests |
| Create | `tests/components/sessions/SessionModal.test.tsx` | Modal component tests |
| Create | `tests/components/mainview/CampaignHeader.session.test.tsx` | Header session display tests |
| Create | `tests/routes/campaigns-sessions.test.tsx` | Sessions page tests |

---

### Task 1: Session Server Functions

**Files:**
- Create: `app/server/functions/sessions.ts`
- Create: `tests/server/functions/sessions.test.ts`

- [ ] **Step 1: Write failing tests for listSessions**

Create `tests/server/functions/sessions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Module-level mocks ---
const mockGetSession = vi.fn()
const mockConnectDB = vi.fn()
const mockIsDBConnected = vi.fn(() => true)
const mockServerCaptureException = vi.fn()
const mockServerCaptureEvent = vi.fn()

vi.mock('~/server/session', () => ({ getSession: () => mockGetSession() }))
vi.mock('~/server/db/connection', () => ({
  connectDB: () => mockConnectDB(),
  isDBConnected: () => mockIsDBConnected(),
}))
vi.mock('~/server/utils/posthog', () => ({
  serverCaptureException: (...args: unknown[]) => mockServerCaptureException(...args),
  serverCaptureEvent: (...args: unknown[]) => mockServerCaptureEvent(...args),
}))

// Mock Mongoose models
const mockUserFindOne = vi.fn()
const mockCampaignFindById = vi.fn()
const mockSessionFind = vi.fn()
const mockSessionCreate = vi.fn()
const mockSessionFindById = vi.fn()
const mockSessionUpdateOne = vi.fn()
const mockSessionCountDocuments = vi.fn()

vi.mock('~/server/db/models/User', () => ({
  User: { findOne: (...args: unknown[]) => mockUserFindOne(...args) },
}))
vi.mock('~/server/db/models/Campaign', () => ({
  Campaign: { findById: (...args: unknown[]) => mockCampaignFindById(...args) },
}))
vi.mock('~/server/db/models/Session', () => ({
  Session: {
    find: (...args: unknown[]) => mockSessionFind(...args),
    create: (...args: unknown[]) => mockSessionCreate(...args),
    findById: (...args: unknown[]) => mockSessionFindById(...args),
    updateOne: (...args: unknown[]) => mockSessionUpdateOne(...args),
    countDocuments: (...args: unknown[]) => mockSessionCountDocuments(...args),
  },
}))

// Helper to set up authenticated GM context
function setupGMContext() {
  const userId = '507f1f77bcf86cd799439011'
  const campaignId = '507f1f77bcf86cd799439022'
  mockGetSession.mockResolvedValue({ id: 'g_1', role: 'gm', name: 'Alice' })
  mockUserFindOne.mockResolvedValue({ _id: userId })
  mockCampaignFindById.mockResolvedValue({
    _id: campaignId,
    gameMasterId: userId,
  })
  return { userId, campaignId }
}

describe('listSessions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockIsDBConnected.mockReturnValue(true)
  })

  it('returns incomplete sessions by default', async () => {
    const { campaignId } = setupGMContext()
    const mockSessions = [
      { _id: 's1', name: 'Session 1', number: 1, startDate: new Date('2026-01-01'), endDate: null, isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { _id: 's2', name: 'Session 0', number: 0, startDate: new Date('2025-12-01'), endDate: null, isActive: false, createdAt: new Date(), updatedAt: new Date() },
    ]
    mockSessionFind.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(mockSessions) }) })

    const { listSessions } = await import('~/server/functions/sessions')
    const result = await listSessions({ data: { campaignId, includeCompleted: false } })

    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Session 1')
    expect(result[0].isActive).toBe(true)
    expect(mockSessionFind).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId, endDate: null }),
      expect.any(String)
    )
  })

  it('returns all sessions when includeCompleted is true', async () => {
    const { campaignId } = setupGMContext()
    mockSessionFind.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) })

    const { listSessions } = await import('~/server/functions/sessions')
    await listSessions({ data: { campaignId, includeCompleted: true } })

    expect(mockSessionFind).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId }),
      expect.any(String)
    )
    // Should NOT have endDate filter
    const callArgs = mockSessionFind.mock.calls[0][0]
    expect(callArgs).not.toHaveProperty('endDate')
  })

  it('throws when user is not the GM', async () => {
    mockGetSession.mockResolvedValue({ id: 'g_1', role: 'gm', name: 'Alice' })
    mockUserFindOne.mockResolvedValue({ _id: 'other-user-id' })
    mockCampaignFindById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439022',
      gameMasterId: '507f1f77bcf86cd799439011',
    })

    const { listSessions } = await import('~/server/functions/sessions')
    await expect(listSessions({ data: { campaignId: '507f1f77bcf86cd799439022', includeCompleted: false } }))
      .rejects.toThrow('Forbidden')
  })
})

describe('createSession', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockIsDBConnected.mockReturnValue(true)
  })

  it('creates an inactive session with auto-assigned number', async () => {
    const { userId, campaignId } = setupGMContext()
    mockSessionCountDocuments.mockResolvedValue(3)
    mockSessionCreate.mockResolvedValue([{
      _id: 'new-session-id',
      name: 'The Fall of Blackmoor',
      number: 3,
      startDate: new Date('2026-04-15'),
      endDate: null,
      isActive: false,
    }])

    const { createSession } = await import('~/server/functions/sessions')
    const result = await createSession({
      data: { campaignId, name: 'The Fall of Blackmoor', startDate: '2026-04-15T00:00:00.000Z' },
    })

    expect(result).toEqual({ success: true, sessionId: 'new-session-id' })
    expect(mockSessionCreate).toHaveBeenCalledWith([expect.objectContaining({
      campaignId,
      name: 'The Fall of Blackmoor',
      gm: userId,
      number: 3,
      isActive: false,
      endDate: null,
    })])
  })
})

describe('updateSession', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockIsDBConnected.mockReturnValue(true)
  })

  it('updates session name and startDate', async () => {
    const { campaignId } = setupGMContext()
    mockSessionFindById.mockResolvedValue({
      _id: 's1',
      campaignId,
      name: 'Old Name',
      startDate: new Date('2026-01-01'),
      save: vi.fn().mockResolvedValue(true),
    })

    const { updateSession } = await import('~/server/functions/sessions')
    const result = await updateSession({
      data: { sessionId: 's1', campaignId, name: 'New Name', startDate: '2026-02-01T00:00:00.000Z' },
    })

    expect(result).toEqual({ success: true })
  })

  it('throws when session does not belong to campaign', async () => {
    setupGMContext()
    mockSessionFindById.mockResolvedValue({
      _id: 's1',
      campaignId: 'different-campaign',
    })

    const { updateSession } = await import('~/server/functions/sessions')
    await expect(updateSession({
      data: { sessionId: 's1', campaignId: '507f1f77bcf86cd799439022', name: 'New', startDate: '2026-02-01T00:00:00.000Z' },
    })).rejects.toThrow('Session not found')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/server/functions/sessions.test.ts`
Expected: FAIL — module `~/server/functions/sessions` does not exist

- [ ] **Step 3: Implement server functions**

Create `app/server/functions/sessions.ts`:

```typescript
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getSession } from '../session'
import { connectDB, isDBConnected } from '../db/connection'
import { User } from '../db/models/User'
import { Campaign } from '../db/models/Campaign'
import { Session } from '../db/models/Session'
import { serverCaptureException, serverCaptureEvent } from '../utils/posthog'

async function requireGM(campaignId: string) {
  const user = await getSession()
  if (!user) throw new Error('Not authenticated')

  await connectDB()
  if (!isDBConnected()) throw new Error('Database not available')

  const dbUser = await User.findOne({ providerId: user.id })
  if (!dbUser) throw new Error('User not found')

  const campaign = await Campaign.findById(campaignId)
  if (!campaign) throw new Error('Campaign not found')
  if (String(campaign.gameMasterId) !== String(dbUser._id)) throw new Error('Forbidden')

  return { user, dbUser, campaign }
}

export const listSessions = createServerFn({ method: 'GET' })
  .inputValidator(z.object({
    campaignId: z.string().min(1),
    includeCompleted: z.boolean().default(false),
  }))
  .handler(async ({ data }) => {
    try {
      const { user } = await requireGM(data.campaignId)

      const filter: Record<string, unknown> = { campaignId: data.campaignId }
      if (!data.includeCompleted) {
        filter.endDate = null
      }

      const docs = await Session.find(
        filter,
        '_id name number startDate endDate isActive createdAt updatedAt'
      ).sort({ startDate: -1 }).lean()

      return (docs as Array<{
        _id: unknown; name: unknown; number: unknown;
        startDate: unknown; endDate: unknown; isActive: unknown
      }>).map(s => ({
        id: String(s._id),
        name: s.name as string,
        number: s.number as number,
        startDate: (s.startDate as Date).toISOString(),
        endDate: s.endDate ? (s.endDate as Date).toISOString() : null,
        isActive: Boolean(s.isActive),
      }))
    } catch (e) {
      serverCaptureException(e, undefined, { action: 'listSessions', campaignId: data.campaignId })
      throw e
    }
  })

export const createSession = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    campaignId: z.string().min(1),
    name: z.string().min(1),
    startDate: z.string().datetime(),
  }))
  .handler(async ({ data }) => {
    try {
      const { user, dbUser } = await requireGM(data.campaignId)

      const count = await Session.countDocuments({ campaignId: data.campaignId })

      const [doc] = await Session.create([{
        campaignId: data.campaignId,
        name: data.name.trim(),
        gm: dbUser._id,
        number: count,
        startDate: new Date(data.startDate),
        endDate: null,
        isActive: false,
      }])

      serverCaptureEvent(user.id, 'session_created', {
        campaign_id: data.campaignId,
        session_id: String(doc._id),
        session_name: data.name.trim(),
      })

      return { success: true, sessionId: String(doc._id) }
    } catch (e) {
      serverCaptureException(e, undefined, { action: 'createSession', campaignId: data.campaignId })
      throw e
    }
  })

export const updateSession = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    sessionId: z.string().min(1),
    campaignId: z.string().min(1),
    name: z.string().min(1),
    startDate: z.string().datetime(),
    endDate: z.string().datetime().optional(),
  }))
  .handler(async ({ data }) => {
    try {
      await requireGM(data.campaignId)

      const session = await Session.findById(data.sessionId)
      if (!session || String(session.campaignId) !== data.campaignId) {
        throw new Error('Session not found')
      }

      session.name = data.name.trim()
      session.startDate = new Date(data.startDate)
      if (data.endDate !== undefined) {
        session.endDate = new Date(data.endDate)
      }
      session.updatedAt = new Date()
      await session.save()

      return { success: true }
    } catch (e) {
      serverCaptureException(e, undefined, { action: 'updateSession', sessionId: data.sessionId })
      throw e
    }
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/server/functions/sessions.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/server/functions/sessions.ts tests/server/functions/sessions.test.ts
git commit -m "feat: add session CRUD server functions (listSessions, createSession, updateSession)"
```

---

### Task 2: Query Keys and React Query Hooks

**Files:**
- Modify: `app/utils/queryKeys.ts`
- Create: `app/hooks/useSessions.ts`

- [ ] **Step 1: Add session query keys**

In `app/utils/queryKeys.ts`, add a `sessions` key group after the `notes` group:

```typescript
sessions: {
  all: ['sessions'] as const,
  list: (campaignId: string, includeCompleted: boolean) =>
    ['sessions', 'list', campaignId, String(includeCompleted)] as const,
},
```

- [ ] **Step 2: Create useSessions hook**

Create `app/hooks/useSessions.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listSessions, createSession, updateSession } from '~/server/functions/sessions'
import { activateSession } from '~/server/functions/campaigns'
import { captureException } from '~/providers/PostHogProvider'
import { queryKeys } from '~/utils/queryKeys'

export function useSessions(campaignId: string, includeCompleted: boolean) {
  const { data: sessions = [], isLoading, error } = useQuery({
    queryKey: queryKeys.sessions.list(campaignId, includeCompleted),
    queryFn: () => listSessions({ data: { campaignId, includeCompleted } }),
  })
  return {
    sessions,
    isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
  }
}

export function useCreateSession() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (input: { campaignId: string; name: string; startDate: string }) =>
      createSession({ data: input }),
    onSuccess: (_data, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(campaignId) })
    },
    onError: (e) => {
      captureException(e, { action: 'createSession' })
    },
  })

  const create = async (input: { campaignId: string; name: string; startDate: string }) => {
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

export function useUpdateSession() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (input: { sessionId: string; campaignId: string; name: string; startDate: string; endDate?: string }) =>
      updateSession({ data: input }),
    onSuccess: (_data, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(campaignId) })
    },
    onError: (e) => {
      captureException(e, { action: 'updateSession' })
    },
  })

  const update = async (input: { sessionId: string; campaignId: string; name: string; startDate: string; endDate?: string }) => {
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

export function useActivateSession() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (input: { campaignId: string; sessionId: string }) =>
      activateSession({ data: input }),
    onSuccess: (_data, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(campaignId) })
    },
    onError: (e) => {
      captureException(e, { action: 'activateSession' })
    },
  })

  const activate = async (input: { campaignId: string; sessionId: string }) => {
    try {
      return await mutation.mutateAsync(input)
    } catch {
      return null
    }
  }

  return {
    activate,
    isLoading: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : mutation.error ? String(mutation.error) : null,
  }
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add app/utils/queryKeys.ts app/hooks/useSessions.ts
git commit -m "feat: add session query keys and React Query hooks"
```

---

### Task 3: CampaignHeader — Active Session Display + Gear Icon

**Files:**
- Modify: `app/components/mainview/CampaignHeader.tsx`
- Modify: `app/routes/campaigns/$campaignId/play.tsx`
- Create: `tests/components/mainview/CampaignHeader.session.test.tsx`

- [ ] **Step 1: Write failing tests for session display in header**

Create `tests/components/mainview/CampaignHeader.session.test.tsx`:

```typescript
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('~/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
  useNavigate: () => mockNavigate,
}))

import { CampaignHeader } from '~/components/mainview/CampaignHeader'
import { useAuth } from '~/hooks/useAuth'

const mockUser = {
  id: 'g_1',
  provider: 'google' as const,
  name: 'Alice',
  email: 'alice@example.com',
  avatar: null,
  role: 'gm' as const,
}

function defaultAuth() {
  vi.mocked(useAuth).mockReturnValue({
    user: mockUser,
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  })
}

describe('CampaignHeader — active session display', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    defaultAuth()
  })

  it('shows active session name and gear icon when isOwner and activeSessionName are provided', () => {
    render(
      <CampaignHeader
        activeTab="dashboard"
        onTabChange={vi.fn()}
        campaignId="c1"
        isOwner={true}
        activeSessionName="Session 61"
      />
    )
    expect(screen.getByTestId('active-session-name')).toHaveTextContent('Session 61')
    expect(screen.getByRole('link', { name: 'Manage sessions' })).toBeInTheDocument()
  })

  it('shows "No Session" when isOwner but no active session', () => {
    render(
      <CampaignHeader
        activeTab="dashboard"
        onTabChange={vi.fn()}
        campaignId="c1"
        isOwner={true}
      />
    )
    expect(screen.getByTestId('active-session-name')).toHaveTextContent('No Session')
    expect(screen.getByRole('link', { name: 'Manage sessions' })).toBeInTheDocument()
  })

  it('does not show session info or gear icon for non-owners', () => {
    render(
      <CampaignHeader
        activeTab="dashboard"
        onTabChange={vi.fn()}
        campaignId="c1"
        isOwner={false}
        activeSessionName="Session 61"
      />
    )
    expect(screen.queryByTestId('active-session-name')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Manage sessions' })).not.toBeInTheDocument()
  })

  it('does not show session info when campaignId is not provided', () => {
    render(
      <CampaignHeader
        activeTab="dashboard"
        onTabChange={vi.fn()}
        isOwner={true}
        activeSessionName="Session 61"
      />
    )
    expect(screen.queryByTestId('active-session-name')).not.toBeInTheDocument()
  })

  it('gear icon links to the sessions management page', () => {
    render(
      <CampaignHeader
        activeTab="dashboard"
        onTabChange={vi.fn()}
        campaignId="c1"
        isOwner={true}
        activeSessionName="Session 61"
      />
    )
    const link = screen.getByRole('link', { name: 'Manage sessions' })
    expect(link).toHaveAttribute('href', '/campaigns/c1/sessions')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/mainview/CampaignHeader.session.test.tsx`
Expected: FAIL — new props not recognized, elements not found

- [ ] **Step 3: Update CampaignHeader component**

Replace the full content of `app/components/mainview/CampaignHeader.tsx`:

```typescript
import React, { useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGear } from '@fortawesome/pro-solid-svg-icons'
import { UserMenu } from '~/components/shared/UserMenu'
import { TABS, handleTabsKeyDown } from './TabNavigation'
import type { TabId } from './TabNavigation'

export interface CampaignHeaderProps {
  campaignId?: string
  sessionNumber?: number
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  isOwner?: boolean
  activeSessionName?: string
}

export function CampaignHeader({
  campaignId,
  sessionNumber,
  activeTab,
  onTabChange,
  isOwner,
  activeSessionName,
}: CampaignHeaderProps) {
  const tablistRef = useRef<HTMLDivElement>(null)

  const showSessionInfo = isOwner && campaignId

  return (
    <nav className="flex items-center h-14 px-4 bg-[#0D1117] border-b border-white/[0.07] sticky top-0 z-50 gap-4">
      <span className="font-sans font-semibold text-xs text-white tracking-widest whitespace-nowrap">
        CARTYX
      </span>

      {/* Active session name + gear icon (GM only) */}
      {showSessionInfo && (
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span
            className="font-sans font-semibold text-xs text-[#2563EB]"
            data-testid="active-session-name"
          >
            {activeSessionName ?? 'No Session'}
          </span>
          <Link
            to="/campaigns/$campaignId/sessions"
            params={{ campaignId }}
            aria-label="Manage sessions"
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <FontAwesomeIcon icon={faGear} className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* Legacy session number display (kept for backwards compatibility) */}
      {!showSessionInfo && sessionNumber !== undefined && (
        <span className="font-sans font-semibold text-xs text-slate-300 whitespace-nowrap" data-testid="session-number">
          Session {sessionNumber}
        </span>
      )}

      {/* Center: Tab bar */}
      <div
        className="flex-1 flex items-center justify-center gap-1"
        role="tablist"
        aria-label="MainView navigation"
        ref={tablistRef}
        onKeyDown={(e) => handleTabsKeyDown(e, activeTab, onTabChange, tablistRef)}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`tab-panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onTabChange(tab.id)}
              className={`font-sans font-semibold text-xs px-4 h-14 border-b-2 transition-colors ${
                isActive
                  ? 'text-white border-[#2563EB]'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Right: Bell + user profile */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Notifications"
          className="text-slate-400 hover:text-slate-200 transition-colors text-base"
        >
          🔔
        </button>

        <UserMenu contextualAction={{ label: 'Close Campaign', to: '/campaigns' }} />
      </div>
    </nav>
  )
}
```

- [ ] **Step 4: Update play.tsx to pass new props to CampaignHeader**

In `app/routes/campaigns/$campaignId/play.tsx`, update the `PlayPage` component to fetch campaign data and pass `isOwner`, `activeSessionName`, and `campaignId`:

Add these imports at the top:
```typescript
import { useCampaign } from '~/hooks/useCampaigns'
```

Update the `PlayPage` function body (before the return):
```typescript
function PlayPage() {
  const { campaignId } = Route.useParams()
  const { tab: activeTab } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { campaign } = useCampaign(campaignId)

  const activeSession = campaign?.sessions.find(s => s.isActive)

  function handleTabChange(tab: TabId) {
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, tab }) })
  }

  return (
    <div className="flex flex-col h-screen bg-[#080A12]">
      <CampaignHeader
        campaignId={campaignId}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isOwner={campaign?.isOwner}
        activeSessionName={activeSession?.name}
      />
```

(Rest of the JSX remains unchanged.)

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/components/mainview/CampaignHeader.session.test.tsx`
Expected: All PASS

Run: `npx vitest run tests/components/mainview/CampaignHeader.test.tsx`
Expected: All PASS (existing tests still work — `sessionNumber` still supported)

- [ ] **Step 6: Commit**

```bash
git add app/components/mainview/CampaignHeader.tsx app/routes/campaigns/\$campaignId/play.tsx tests/components/mainview/CampaignHeader.session.test.tsx
git commit -m "feat: show active session name and gear icon in CampaignHeader (GM-only)"
```

---

### Task 4: Session Modal Component

**Files:**
- Create: `app/components/sessions/SessionModal.tsx`
- Create: `tests/components/sessions/SessionModal.test.tsx`

- [ ] **Step 1: Write failing tests for SessionModal**

Create `tests/components/sessions/SessionModal.test.tsx`:

```typescript
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SessionModal } from '~/components/sessions/SessionModal'

describe('SessionModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(true),
    isLoading: false,
  }

  beforeEach(() => {
    vi.resetAllMocks()
    defaultProps.onSubmit.mockResolvedValue(true)
  })

  it('renders create form when no session is provided', () => {
    render(<SessionModal {...defaultProps} />)
    expect(screen.getByText('Create Session')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('Start Date')).toHaveValue('')
  })

  it('renders edit form when session is provided', () => {
    render(
      <SessionModal
        {...defaultProps}
        session={{ id: 's1', name: 'Session 5', number: 5, startDate: '2026-03-01T00:00:00.000Z', endDate: null, isActive: false }}
      />
    )
    expect(screen.getByText('Edit Session')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Session 5')
  })

  it('shows end date field only in edit mode', () => {
    const { rerender } = render(<SessionModal {...defaultProps} />)
    expect(screen.queryByLabelText('End Date')).not.toBeInTheDocument()

    rerender(
      <SessionModal
        {...defaultProps}
        session={{ id: 's1', name: 'Session 5', number: 5, startDate: '2026-03-01T00:00:00.000Z', endDate: null, isActive: false }}
      />
    )
    expect(screen.getByLabelText('End Date')).toBeInTheDocument()
  })

  it('validates required fields on submit', async () => {
    render(<SessionModal {...defaultProps} />)
    fireEvent.click(screen.getByText('Create'))
    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument()
      expect(screen.getByText('Start date is required')).toBeInTheDocument()
    })
    expect(defaultProps.onSubmit).not.toHaveBeenCalled()
  })

  it('calls onSubmit with form data and closes on success', async () => {
    render(<SessionModal {...defaultProps} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Session 62' } })
    fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2026-04-15' } })
    fireEvent.click(screen.getByText('Create'))

    await waitFor(() => {
      expect(defaultProps.onSubmit).toHaveBeenCalledWith({
        name: 'Session 62',
        startDate: '2026-04-15',
        endDate: undefined,
      })
      expect(defaultProps.onClose).toHaveBeenCalled()
    })
  })

  it('does not render when isOpen is false', () => {
    render(<SessionModal {...defaultProps} isOpen={false} />)
    expect(screen.queryByText('Create Session')).not.toBeInTheDocument()
  })

  it('closes when backdrop is clicked', () => {
    render(<SessionModal {...defaultProps} />)
    const backdrop = screen.getByRole('dialog').parentElement!
    fireEvent.click(backdrop)
    expect(defaultProps.onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/sessions/SessionModal.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement SessionModal**

Create `app/components/sessions/SessionModal.tsx`:

```typescript
import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { FormInput } from '~/components/FormInput'
import { PixelButton } from '~/components/PixelButton'
import type { CampaignData } from '~/server/functions/campaigns'

type SessionData = CampaignData['sessions'][number]

interface SessionModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: { name: string; startDate: string; endDate?: string }) => Promise<boolean>
  isLoading: boolean
  session?: SessionData
}

interface FieldErrors {
  name?: string
  startDate?: string
}

export function SessionModal({ isOpen, onClose, onSubmit, isLoading, session }: SessionModalProps) {
  const isEdit = !!session
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (session) {
      setName(session.name)
      setStartDate(session.startDate.slice(0, 10))
      setEndDate(session.endDate ? session.endDate.slice(0, 10) : '')
    } else {
      setName('')
      setStartDate('')
      setEndDate('')
    }
    setFieldErrors({})
    setHasSubmitted(false)
    setError(null)
  }, [session, isOpen])

  function validate(): FieldErrors {
    const errors: FieldErrors = {}
    if (!name.trim()) errors.name = 'Name is required'
    if (!startDate) errors.startDate = 'Start date is required'
    return errors
  }

  useEffect(() => {
    if (hasSubmitted) setFieldErrors(validate())
  }, [hasSubmitted, name, startDate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setHasSubmitted(true)
    setError(null)

    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    const success = await onSubmit({
      name: name.trim(),
      startDate,
      endDate: isEdit && endDate ? endDate : undefined,
    })

    if (success) {
      onClose()
    } else {
      setError('Failed to save session. Please try again.')
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-2 sm:p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-[#0D1117] border border-white/[0.07] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-modal-title"
      >
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07]">
          <h2 id="session-modal-title" className="font-sans font-bold text-sm text-blue-400 uppercase tracking-widest">
            {isEdit ? 'Edit Session' : 'Create Session'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs font-semibold">
              {error}
            </div>
          )}

          <FormInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Session 62 or The Fall of Blackmoor"
            disabled={isLoading}
            error={fieldErrors.name}
          />

          <FormInput
            label="Start Date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={isLoading}
            error={fieldErrors.startDate}
          />

          {isEdit && (
            <FormInput
              label="End Date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={isLoading}
            />
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.07] bg-white/[0.01]">
          <PixelButton
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isLoading}
            type="button"
          >
            Cancel
          </PixelButton>
          <PixelButton
            variant="primary"
            size="sm"
            disabled={isLoading}
            type="submit"
          >
            {isLoading ? 'Saving...' : isEdit ? 'Save' : 'Create'}
          </PixelButton>
        </footer>
      </form>
    </div>,
    document.body
  )
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/components/sessions/SessionModal.test.tsx`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add app/components/sessions/SessionModal.tsx tests/components/sessions/SessionModal.test.tsx
git commit -m "feat: add SessionModal component for create/edit sessions"
```

---

### Task 5: Sessions Management Page

**Files:**
- Create: `app/routes/campaigns/$campaignId/sessions.tsx`
- Create: `tests/routes/campaigns-sessions.test.tsx`

- [ ] **Step 1: Write failing tests for sessions route**

Create `tests/routes/campaigns-sessions.test.tsx`:

```typescript
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock hooks
const mockUseSessions = vi.fn()
const mockUseCreateSession = vi.fn()
const mockUseUpdateSession = vi.fn()
const mockUseActivateSession = vi.fn()
const mockUseCampaign = vi.fn()

vi.mock('~/hooks/useSessions', () => ({
  useSessions: (...args: unknown[]) => mockUseSessions(...args),
  useCreateSession: () => mockUseCreateSession(),
  useUpdateSession: () => mockUseUpdateSession(),
  useActivateSession: () => mockUseActivateSession(),
}))
vi.mock('~/hooks/useCampaigns', () => ({
  useCampaign: (...args: unknown[]) => mockUseCampaign(...args),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
  useParams: () => ({ campaignId: 'c1' }),
  createFileRoute: () => () => ({ useParams: () => ({ campaignId: 'c1' }) }),
  redirect: vi.fn(),
}))

// Import after mocks
import { SessionsPage } from '~/routes/campaigns/$campaignId/sessions'

const baseSessions = [
  { id: 's1', name: 'Session 1', number: 1, startDate: '2026-01-01T00:00:00.000Z', endDate: null, isActive: true },
  { id: 's2', name: 'Session 0', number: 0, startDate: '2025-12-01T00:00:00.000Z', endDate: null, isActive: false },
]

function setupMocks(sessions = baseSessions) {
  mockUseSessions.mockReturnValue({ sessions, isLoading: false, error: null })
  mockUseCampaign.mockReturnValue({ campaign: { isOwner: true }, isLoading: false, error: null })
  mockUseCreateSession.mockReturnValue({ create: vi.fn().mockResolvedValue({ success: true }), isLoading: false, error: null })
  mockUseUpdateSession.mockReturnValue({ update: vi.fn().mockResolvedValue({ success: true }), isLoading: false, error: null })
  mockUseActivateSession.mockReturnValue({ activate: vi.fn().mockResolvedValue({ success: true }), isLoading: false, error: null })
}

describe('SessionsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setupMocks()
  })

  it('renders session list', () => {
    render(<SessionsPage />)
    expect(screen.getByText('Session 1')).toBeInTheDocument()
    expect(screen.getByText('Session 0')).toBeInTheDocument()
  })

  it('highlights the active session', () => {
    render(<SessionsPage />)
    const activeCard = screen.getByText('Session 1').closest('article')
    expect(activeCard).toHaveClass('border-l-[#2563EB]')
  })

  it('shows Activate button only on non-active incomplete sessions', () => {
    render(<SessionsPage />)
    const activateButtons = screen.getAllByRole('button', { name: /Activate/ })
    expect(activateButtons).toHaveLength(1) // only Session 0
  })

  it('shows empty state when no sessions exist', () => {
    setupMocks([])
    render(<SessionsPage />)
    expect(screen.getByText(/No sessions yet/)).toBeInTheDocument()
  })

  it('opens create modal when New Session button is clicked', () => {
    render(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /New Session/ }))
    expect(screen.getByText('Create Session')).toBeInTheDocument()
  })

  it('shows back link to play page', () => {
    render(<SessionsPage />)
    expect(screen.getByRole('link', { name: /Back/ })).toHaveAttribute('href', '/campaigns/c1/play')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/routes/campaigns-sessions.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the sessions route**

Create `app/routes/campaigns/$campaignId/sessions.tsx`:

```typescript
import React, { useState } from 'react'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faPlus } from '@fortawesome/pro-solid-svg-icons'
import { getMe } from '~/server/functions/auth'
import { useCampaign } from '~/hooks/useCampaigns'
import { useSessions, useCreateSession, useUpdateSession, useActivateSession } from '~/hooks/useSessions'
import { SessionModal } from '~/components/sessions/SessionModal'
import { PixelButton } from '~/components/PixelButton'
import type { CampaignData } from '~/server/functions/campaigns'

type SessionData = CampaignData['sessions'][number]

export const Route = createFileRoute('/campaigns/$campaignId/sessions')({
  beforeLoad: async () => {
    const user = await getMe()
    if (!user) throw redirect({ to: '/', search: { reason: 'session_expired' } })
    return { user }
  },
  component: SessionsPage,
})

export function SessionsPage() {
  const { campaignId } = Route.useParams()
  const { campaign } = useCampaign(campaignId)
  const [includeCompleted, setIncludeCompleted] = useState(false)
  const { sessions, isLoading } = useSessions(campaignId, includeCompleted)
  const { create, isLoading: isCreating } = useCreateSession()
  const { update, isLoading: isUpdating } = useUpdateSession()
  const { activate, isLoading: isActivating } = useActivateSession()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingSession, setEditingSession] = useState<SessionData | undefined>()
  const [confirmActivateId, setConfirmActivateId] = useState<string | null>(null)

  // Redirect non-owners (should not reach this page)
  if (campaign && !campaign.isOwner) {
    return null
  }

  function handleOpenCreate() {
    setEditingSession(undefined)
    setModalOpen(true)
  }

  function handleOpenEdit(session: SessionData) {
    setEditingSession(session)
    setModalOpen(true)
  }

  async function handleModalSubmit(data: { name: string; startDate: string; endDate?: string }) {
    if (editingSession) {
      const result = await update({
        sessionId: editingSession.id,
        campaignId,
        name: data.name,
        startDate: new Date(data.startDate).toISOString(),
        endDate: data.endDate ? new Date(data.endDate).toISOString() : undefined,
      })
      return !!result
    } else {
      const result = await create({
        campaignId,
        name: data.name,
        startDate: new Date(data.startDate).toISOString(),
      })
      return !!result
    }
  }

  async function handleActivate(sessionId: string) {
    await activate({ campaignId, sessionId })
    setConfirmActivateId(null)
  }

  const activeSession = sessions.find(s => s.isActive)

  return (
    <div className="min-h-screen bg-[#080A12]">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#0D1117] border-b border-white/[0.07]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/campaigns/$campaignId/play"
              params={{ campaignId }}
              search={{ tab: 'dashboard' }}
              className="text-slate-400 hover:text-white transition-colors"
              aria-label="Back to campaign"
            >
              <FontAwesomeIcon icon={faArrowLeft} className="h-4 w-4" />
            </Link>
            <h1 className="font-sans font-bold text-sm text-white uppercase tracking-widest">
              Sessions
            </h1>
          </div>
          <PixelButton variant="primary" size="sm" onClick={handleOpenCreate} type="button">
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
            New Session
          </PixelButton>
        </div>
      </div>

      {/* Filter toggle */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 pb-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={includeCompleted}
            onChange={(e) => setIncludeCompleted(e.target.checked)}
            className="rounded border-white/20 bg-white/[0.04] text-blue-500 focus:ring-blue-500/30"
          />
          <span className="font-sans text-xs text-slate-400">Show completed sessions</span>
        </label>
      </div>

      {/* Session list */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 space-y-3">
        {isLoading ? (
          <p className="font-sans text-xs text-on-surface-variant text-center py-12">Loading sessions...</p>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12">
            <p className="font-sans text-sm text-slate-400">No sessions yet</p>
            <p className="font-sans text-xs text-slate-600 mt-1">Create your first session to get started.</p>
          </div>
        ) : (
          sessions.map((session) => {
            const isActive = session.isActive
            const isCompleted = !!session.endDate
            const isConfirming = confirmActivateId === session.id

            return (
              <article
                key={session.id}
                className={[
                  'p-4 rounded-lg border transition-all cursor-pointer',
                  'hover:bg-white/[0.02]',
                  isActive
                    ? 'bg-[#2563EB]/5 border-l-4 border-l-[#2563EB] border-t border-r border-b border-t-white/[0.07] border-r-white/[0.07] border-b-white/[0.07]'
                    : isCompleted
                      ? 'bg-white/[0.01] border-white/[0.05] opacity-60'
                      : 'bg-surface-container-highest/10 border-white/[0.07]',
                ].join(' ')}
                onClick={() => handleOpenEdit(session)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-sans font-bold text-sm text-white truncate">{session.name}</h3>
                      {isActive && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#2563EB]/10 border border-[#2563EB]/30 text-[#2563EB] text-[10px] font-bold uppercase tracking-wider">
                          Active
                        </span>
                      )}
                      {isCompleted && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-500/10 border border-slate-500/20 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                          Completed
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="font-sans text-xs text-slate-500">
                        Started: {new Date(session.startDate).toLocaleDateString()}
                      </span>
                      {session.endDate && (
                        <span className="font-sans text-xs text-slate-500">
                          Ended: {new Date(session.endDate).toLocaleDateString()}
                        </span>
                      )}
                      {!session.endDate && !isActive && (
                        <span className="font-sans text-xs text-slate-600 italic">In Progress</span>
                      )}
                    </div>
                  </div>

                  {/* Activate button for non-active, incomplete sessions */}
                  {!isActive && !isCompleted && (
                    <div className="ml-4 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {isConfirming ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">
                            {activeSession ? 'This will complete the active session.' : 'Activate this session?'}
                          </span>
                          <PixelButton
                            variant="primary"
                            size="sm"
                            onClick={() => handleActivate(session.id)}
                            disabled={isActivating}
                            type="button"
                          >
                            {isActivating ? 'Activating...' : 'Confirm'}
                          </PixelButton>
                          <PixelButton
                            variant="secondary"
                            size="sm"
                            onClick={() => setConfirmActivateId(null)}
                            disabled={isActivating}
                            type="button"
                          >
                            Cancel
                          </PixelButton>
                        </div>
                      ) : (
                        <PixelButton
                          variant="secondary"
                          size="sm"
                          onClick={() => setConfirmActivateId(session.id)}
                          type="button"
                        >
                          Activate
                        </PixelButton>
                      )}
                    </div>
                  )}
                </div>
              </article>
            )
          })
        )}
      </div>

      {/* Session modal */}
      <SessionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleModalSubmit}
        isLoading={isCreating || isUpdating}
        session={editingSession}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/routes/campaigns-sessions.test.tsx`
Expected: All PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add app/routes/campaigns/\$campaignId/sessions.tsx tests/routes/campaigns-sessions.test.tsx
git commit -m "feat: add session management page at /campaigns/:campaignId/sessions"
```

---

### Task 6: Integration Verification

- [ ] **Step 1: Type check the entire project**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Verify dev server starts**

Run: `npx vinxi dev` (or the project's dev command)
Expected: Server starts without errors. Navigate to a campaign's play page to verify the header shows the active session name and gear icon.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address integration issues from session manager implementation"
```
