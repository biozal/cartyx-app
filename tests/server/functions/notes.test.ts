import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    inputValidator: () => ({
      handler: (fn: unknown) => fn,
    }),
    handler: (fn: unknown) => fn,
  }),
}))

vi.mock('~/server/session', () => ({ getSession: vi.fn() }))
vi.mock('~/server/db/connection', () => ({
  connectDB: vi.fn(),
  isDBConnected: vi.fn(() => true),
}))
vi.mock('~/server/db/models/User', () => ({
  User: { findOne: vi.fn() },
}))
vi.mock('~/server/db/models/Campaign', () => ({
  Campaign: { findById: vi.fn() },
}))
vi.mock('~/server/db/models/Note', () => ({
  Note: {
    create: vi.fn(),
    findById: vi.fn(),
    find: vi.fn(),
  },
}))
vi.mock('~/server/utils/posthog', () => ({
  serverCaptureException: vi.fn(),
  serverCaptureEvent: vi.fn(),
}))

import { getSession } from '~/server/session'
import { User } from '~/server/db/models/User'
import { Campaign } from '~/server/db/models/Campaign'
import { Note } from '~/server/db/models/Note'
import { createNote, updateNote, listNotes, getNote, createNoteSchema, updateNoteSchema, listNotesSchema } from '~/server/functions/notes'
import { serverCaptureEvent } from '~/server/utils/posthog'

const mockSession = {
  id: 'session-user-1',
  provider: 'google',
  name: 'Test User',
  email: 'test@example.com',
  avatar: null,
  role: 'gm',
  accessToken: null,
  refreshToken: null,
  tokenIssuedAt: 0,
}
const mockDbUser = { _id: 'dbuser-1', firstName: 'Test', lastName: 'User' }
const mockCampaign = {
  _id: 'camp-1',
  gameMasterId: 'dbuser-1',
  members: [{ userId: 'dbuser-1', role: 'gm' }],
}

function makeNote(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'note-1',
    campaignId: 'camp-1',
    sessionId: 'sess-1',
    createdBy: 'dbuser-1',
    title: 'Test Note',
    note: '# Hello\n\nThis is a test note.',
    tags: ['combat', 'loot'],
    isPublic: false,
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
    save: vi.fn(),
    ...overrides,
  }
}

// Cast server functions to callable handler signatures
const _createNote = createNote as unknown as (args: { data: Record<string, unknown> }) => Promise<{ success: boolean; note: Record<string, unknown> }>
const _updateNote = updateNote as unknown as (args: { data: Record<string, unknown> }) => Promise<{ success: boolean; note: Record<string, unknown> }>
const _listNotes = listNotes as unknown as (args: { data: Record<string, unknown> }) => Promise<Array<Record<string, unknown>>>
const _getNote = getNote as unknown as (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown> | null>

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSession).mockResolvedValue(mockSession)
  vi.mocked(User.findOne).mockResolvedValue(mockDbUser)
  vi.mocked(Campaign.findById).mockResolvedValue(mockCampaign)
})

// ---------------------------------------------------------------------------
// createNote
// ---------------------------------------------------------------------------

describe('createNote', () => {
  it('creates a note with required fields and normalized tags', async () => {
    const created = makeNote()
    vi.mocked(Note.create).mockResolvedValue(created as never)

    const result = await _createNote({
      data: {
        campaignId: 'camp-1',
        sessionId: 'sess-1',
        title: '  My Note  ',
        note: '# Content',
        tags: [' Combat ', 'LOOT', ' combat '],
      },
    })

    expect(result.success).toBe(true)
    expect(result.note.id).toBe('note-1')
    // Verify tags were normalized (lowercase, trimmed, deduplicated)
    expect(vi.mocked(Note.create).mock.calls[0][0]).toMatchObject({
      title: 'My Note',
      note: '# Content',
      tags: ['combat', 'loot'],
    })
  })

  it('defaults isPublic to false when omitted', async () => {
    vi.mocked(Note.create).mockResolvedValue(makeNote() as never)

    await _createNote({
      data: {
        campaignId: 'camp-1',
        sessionId: 'sess-1',
        title: 'My Note',
        note: 'body',
      },
    })

    expect(vi.mocked(Note.create).mock.calls[0][0]).toMatchObject({
      isPublic: false,
    })
  })

  it('allows explicitly setting isPublic to true', async () => {
    vi.mocked(Note.create).mockResolvedValue(makeNote({ isPublic: true }) as never)

    await _createNote({
      data: {
        campaignId: 'camp-1',
        sessionId: 'sess-1',
        title: 'Public Note',
        note: 'body',
        isPublic: true,
      },
    })

    expect(vi.mocked(Note.create).mock.calls[0][0]).toMatchObject({
      isPublic: true,
    })
  })

  it('throws when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null)

    await expect(
      _createNote({ data: { campaignId: 'camp-1', sessionId: 'sess-1', title: 'T', note: 'B' } }),
    ).rejects.toThrow('Not authenticated')
  })

  it('throws when user is not a campaign member', async () => {
    vi.mocked(Campaign.findById).mockResolvedValue({
      _id: 'camp-1',
      gameMasterId: 'someone-else',
      members: [{ userId: 'someone-else', role: 'gm' }],
    })

    await expect(
      _createNote({ data: { campaignId: 'camp-1', sessionId: 'sess-1', title: 'T', note: 'B' } }),
    ).rejects.toThrow('Forbidden')
  })

  it('fires note_created analytics event', async () => {
    vi.mocked(Note.create).mockResolvedValue(makeNote() as never)

    await _createNote({
      data: { campaignId: 'camp-1', sessionId: 'sess-1', title: 'T', note: 'B' },
    })

    expect(serverCaptureEvent).toHaveBeenCalledWith('session-user-1', 'note_created', {
      campaign_id: 'camp-1',
      note_id: 'note-1',
    })
  })
})

// ---------------------------------------------------------------------------
// updateNote
// ---------------------------------------------------------------------------

describe('updateNote', () => {
  it('updates an existing note', async () => {
    const existing = makeNote()
    vi.mocked(Note.findById).mockResolvedValue(existing as never)

    const result = await _updateNote({
      data: {
        id: 'note-1',
        campaignId: 'camp-1',
        sessionId: 'sess-2',
        title: 'Updated Title',
        note: 'Updated body',
        tags: ['new-tag'],
      },
    })

    expect(result.success).toBe(true)
    expect(existing.save).toHaveBeenCalled()
    expect(existing.title).toBe('Updated Title')
    expect(existing.note).toBe('Updated body')
    expect(existing.tags).toEqual(['new-tag'])
    expect(existing.sessionId).toBe('sess-2')
  })

  it('throws when note is not found', async () => {
    vi.mocked(Note.findById).mockResolvedValue(null)

    await expect(
      _updateNote({
        data: { id: 'nonexistent', campaignId: 'camp-1', sessionId: 'sess-1', title: 'T', note: 'B' },
      }),
    ).rejects.toThrow('Note not found')
  })

  it('throws when note belongs to a different campaign', async () => {
    const existing = makeNote({ campaignId: 'camp-other' })
    vi.mocked(Note.findById).mockResolvedValue(existing as never)

    await expect(
      _updateNote({
        data: { id: 'note-1', campaignId: 'camp-1', sessionId: 'sess-1', title: 'T', note: 'B' },
      }),
    ).rejects.toThrow('Forbidden')
  })

  it('fires note_updated analytics event', async () => {
    const existing = makeNote()
    vi.mocked(Note.findById).mockResolvedValue(existing as never)

    await _updateNote({
      data: { id: 'note-1', campaignId: 'camp-1', sessionId: 'sess-1', title: 'T', note: 'B' },
    })

    expect(serverCaptureEvent).toHaveBeenCalledWith('session-user-1', 'note_updated', {
      campaign_id: 'camp-1',
      note_id: 'note-1',
      updated_by: 'dbuser-1',
    })
  })
})

// ---------------------------------------------------------------------------
// listNotes
// ---------------------------------------------------------------------------

describe('listNotes', () => {
  it('returns notes for a campaign', async () => {
    const notes = [makeNote(), makeNote({ _id: 'note-2', title: 'Second Note' })]
    vi.mocked(Note.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(notes) }),
    } as never)

    const result = await _listNotes({ data: { campaignId: 'camp-1' } })

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('note-1')
    expect(result[1].title).toBe('Second Note')
  })

  it('filters by sessionId', async () => {
    vi.mocked(Note.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    } as never)

    await _listNotes({ data: { campaignId: 'camp-1', sessionId: 'sess-2' } })

    expect(vi.mocked(Note.find).mock.calls[0][0]).toMatchObject({
      campaignId: 'camp-1',
      sessionId: 'sess-2',
    })
  })

  it('filters by visibility=public', async () => {
    vi.mocked(Note.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    } as never)

    await _listNotes({ data: { campaignId: 'camp-1', visibility: 'public' } })

    expect(vi.mocked(Note.find).mock.calls[0][0]).toMatchObject({
      isPublic: true,
    })
  })

  it('filters by visibility=private (own notes only)', async () => {
    vi.mocked(Note.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    } as never)

    await _listNotes({ data: { campaignId: 'camp-1', visibility: 'private' } })

    expect(vi.mocked(Note.find).mock.calls[0][0]).toMatchObject({
      isPublic: false,
      createdBy: 'dbuser-1',
    })
  })

  it('applies text search filter', async () => {
    vi.mocked(Note.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    } as never)

    await _listNotes({ data: { campaignId: 'camp-1', search: 'dragon' } })

    expect(vi.mocked(Note.find).mock.calls[0][0]).toMatchObject({
      $text: { $search: 'dragon' },
    })
  })

  it('ignores empty search string', async () => {
    vi.mocked(Note.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    } as never)

    await _listNotes({ data: { campaignId: 'camp-1', search: '   ' } })

    expect(vi.mocked(Note.find).mock.calls[0][0]).not.toHaveProperty('$text')
  })

  it('throws when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null)

    await expect(
      _listNotes({ data: { campaignId: 'camp-1' } }),
    ).rejects.toThrow('Not authenticated')
  })
})

// ---------------------------------------------------------------------------
// getNote
// ---------------------------------------------------------------------------

describe('getNote', () => {
  it('returns a note for the owner', async () => {
    const note = makeNote()
    vi.mocked(Note.findById).mockResolvedValue(note as never)

    const result = await _getNote({ data: { id: 'note-1', campaignId: 'camp-1' } })

    expect(result).not.toBeNull()
    expect(result!.id).toBe('note-1')
  })

  it('returns null when note does not exist', async () => {
    vi.mocked(Note.findById).mockResolvedValue(null)

    const result = await _getNote({ data: { id: 'nonexistent', campaignId: 'camp-1' } })

    expect(result).toBeNull()
  })

  it('returns null for private notes not owned by the user', async () => {
    const note = makeNote({ createdBy: 'other-user', isPublic: false })
    vi.mocked(Note.findById).mockResolvedValue(note as never)

    const result = await _getNote({ data: { id: 'note-1', campaignId: 'camp-1' } })

    expect(result).toBeNull()
  })

  it('returns public notes even from other users', async () => {
    const note = makeNote({ createdBy: 'other-user', isPublic: true })
    vi.mocked(Note.findById).mockResolvedValue(note as never)

    const result = await _getNote({ data: { id: 'note-1', campaignId: 'camp-1' } })

    expect(result).not.toBeNull()
    expect(result!.id).toBe('note-1')
  })

  it('returns null when note belongs to a different campaign', async () => {
    const note = makeNote({ campaignId: 'camp-other' })
    vi.mocked(Note.findById).mockResolvedValue(note as never)

    const result = await _getNote({ data: { id: 'note-1', campaignId: 'camp-1' } })

    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Zod schemas — validation
// ---------------------------------------------------------------------------

describe('createNoteSchema', () => {
  it('rejects when title is empty', () => {
    const result = createNoteSchema.safeParse({
      campaignId: 'camp-1',
      sessionId: 'sess-1',
      title: '',
      note: 'body',
    })
    expect(result.success).toBe(false)
  })

  it('rejects when note body is empty', () => {
    const result = createNoteSchema.safeParse({
      campaignId: 'camp-1',
      sessionId: 'sess-1',
      title: 'Title',
      note: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects when sessionId is missing', () => {
    const result = createNoteSchema.safeParse({
      campaignId: 'camp-1',
      title: 'Title',
      note: 'body',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid input with defaults', () => {
    const result = createNoteSchema.safeParse({
      campaignId: 'camp-1',
      sessionId: 'sess-1',
      title: 'Title',
      note: 'body',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.isPublic).toBe(false)
      expect(result.data.tags).toEqual([])
    }
  })
})

describe('updateNoteSchema', () => {
  it('rejects when id is missing', () => {
    const result = updateNoteSchema.safeParse({
      campaignId: 'camp-1',
      sessionId: 'sess-1',
      title: 'Title',
      note: 'body',
    })
    expect(result.success).toBe(false)
  })

  it('rejects when title is empty', () => {
    const result = updateNoteSchema.safeParse({
      id: 'note-1',
      campaignId: 'camp-1',
      sessionId: 'sess-1',
      title: '',
      note: 'body',
    })
    expect(result.success).toBe(false)
  })
})

describe('listNotesSchema', () => {
  it('defaults visibility to all', () => {
    const result = listNotesSchema.safeParse({ campaignId: 'camp-1' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.visibility).toBe('all')
    }
  })

  it('rejects invalid visibility value', () => {
    const result = listNotesSchema.safeParse({ campaignId: 'camp-1', visibility: 'secret' })
    expect(result.success).toBe(false)
  })
})
