// Mock useNotes hooks for Storybook
import type { NoteData, NoteListItem } from '~/types/note'

interface ListNotesFilters {
  sessionId?: string
  search?: string
  visibility?: 'all' | 'public' | 'private'
}

export function useNotes(_campaignId: string, _filters?: ListNotesFilters) {
  return {
    notes: [] as NoteListItem[],
    isLoading: false,
    error: null,
  }
}

export function useNote(_id: string, _campaignId: string) {
  return {
    note: null as NoteData | null,
    isLoading: false,
    error: null,
  }
}

export function useCreateNote() {
  return {
    create: async (_input: unknown) => ({ id: 'new-note-1' }),
    isLoading: false,
    error: null,
  }
}

export function useUpdateNote() {
  return {
    update: async (_input: unknown) => ({ id: 'note-1' }),
    isLoading: false,
    error: null,
  }
}

export function useDeleteNote() {
  return {
    remove: async (_input: unknown) => ({ success: true }),
    isLoading: false,
    error: null,
  }
}
