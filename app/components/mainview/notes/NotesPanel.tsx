import React, { useState, useEffect } from 'react'
import { useParams } from '@tanstack/react-router'
import { NotesFilterWidget } from './NotesFilterWidget'
import { NotesListWidget } from './NotesListWidget'
import { NoteModal } from './NoteModal'
import { useNotes } from '~/hooks/useNotes'
import { getSessions, Session } from '~/services/mocks/sessionsService'
import { NoteListItem } from '~/server/functions/notes'

export function NotesPanel() {
  const { campaignId } = useParams({ from: '/campaigns/$campaignId/play' })
  
  const [search, setSearch] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [visibility, setVisibility] = useState<'all' | 'public' | 'private'>('all')
  const [sessions, setSessions] = useState<Session[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedNoteId, setSelectedNoteId] = useState<string | undefined>()

  const { notes, isLoading, error } = useNotes(campaignId, {
    search: search || undefined,
    sessionId: sessionId || undefined,
    visibility,
  })

  useEffect(() => {
    void getSessions().then(setSessions)
  }, [])

  const handleCreateClick = () => {
    setSelectedNoteId(undefined)
    setIsModalOpen(true)
  }

  const handleNoteClick = (note: NoteListItem) => {
    setSelectedNoteId(note.id)
    setIsModalOpen(true)
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setSelectedNoteId(undefined)
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#080A12]">
      <NotesFilterWidget
        search={search}
        onSearchChange={setSearch}
        sessionId={sessionId}
        onSessionChange={setSessionId}
        visibility={visibility}
        onVisibilityChange={setVisibility}
        sessions={sessions}
        onCreateClick={handleCreateClick}
      />
      <NotesListWidget
        notes={notes}
        sessions={sessions}
        isLoading={isLoading}
        error={error}
        onNoteClick={handleNoteClick}
      />
      <NoteModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        campaignId={campaignId}
        noteId={selectedNoteId}
        sessions={sessions}
        defaultSessionId={sessionId}
      />
    </div>
  )
}
