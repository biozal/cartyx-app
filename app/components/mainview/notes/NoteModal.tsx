import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Globe, Lock, AlertCircle } from 'lucide-react'
import { FormInput } from '~/components/FormInput'
import { FormTextarea } from '~/components/FormTextarea'
import { FormSelect } from '~/components/FormSelect'
import { PixelButton } from '~/components/PixelButton'
import { Session } from '~/services/mocks/sessionsService'
import { useCreateNote, useUpdateNote, useNote } from '~/hooks/useNotes'

interface NoteModalProps {
  isOpen: boolean
  onClose: () => void
  campaignId: string
  noteId?: string // If provided, we are editing
  sessions: Session[]
  defaultSessionId?: string
}

export function NoteModal({
  isOpen,
  onClose,
  campaignId,
  noteId,
  sessions,
  defaultSessionId,
}: NoteModalProps) {
  const { note: fetchedNote, isLoading: isLoadingNote } = useNote(noteId ?? '', campaignId)
  const { create, isLoading: isCreating } = useCreateNote()
  const { update, isLoading: isUpdating } = useUpdateNote()

  const [title, setTitle] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (noteId && fetchedNote) {
      setTitle(fetchedNote.title)
      setSessionId(fetchedNote.sessionId)
      setContent(fetchedNote.note)
      setTags(fetchedNote.tags.join(', '))
      setIsPublic(fetchedNote.isPublic)
    } else if (!noteId) {
      setTitle('')
      setSessionId(defaultSessionId ?? (sessions[0]?.id ?? ''))
      setContent('')
      setTags('')
      setIsPublic(false)
    }
  }, [noteId, fetchedNote, defaultSessionId, sessions, isOpen])

  const sessionOptions = useMemo(() => sessions.map((s) => ({
    value: s.id,
    label: `Session ${s.number}: ${s.name}`,
  })), [sessions])

  const isSessionMissing = sessions.length === 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSessionMissing) return
    
    setError(null)

    const tagArray = tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)

    const input = {
      campaignId,
      sessionId,
      title,
      note: content,
      tags: tagArray,
      isPublic,
    }

    let success = false
    if (noteId) {
      const result = await update({ ...input, id: noteId })
      success = !!result
    } else {
      const result = await create(input)
      success = !!result
    }

    if (success) {
      onClose()
    } else {
      setError('Failed to save note. Please try again.')
    }
  }

  if (!isOpen) return null

  const isLoading = (noteId && isLoadingNote) || isCreating || isUpdating

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="note-modal-title"
    >
      <form 
        onSubmit={handleSubmit}
        className="w-full max-w-2xl bg-[#0D1117] border border-white/[0.07] rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07]">
          <h2 id="note-modal-title" className="font-sans font-bold text-sm text-blue-400 uppercase tracking-widest">
            {noteId ? 'Edit Note' : 'Create Note'}
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

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs font-semibold">
              {error}
            </div>
          )}

          {isSessionMissing && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-amber-200 text-xs font-bold uppercase tracking-wider">Session Required</p>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  You cannot create a note without a session. Please ensure sessions are loaded before creating notes.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormInput
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. The Traitor's Meeting"
              required
              disabled={isLoading || isSessionMissing}
            />
            <FormSelect
              label="Session"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              options={sessionOptions}
              disabled={isLoading || isSessionMissing}
              required
            />
          </div>

          <FormTextarea
            label="Note"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What happened? What did you discover?..."
            textareaClassName="min-h-[200px]"
            disabled={isLoading || isSessionMissing}
            required
          />

          <FormInput
            label="Tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="lore, npc, secret (comma separated)"
            hint="Tags will be prefixed with # in the list"
            disabled={isLoading || isSessionMissing}
          />

          <div className="flex items-center gap-6 pt-2">
            <label className={`flex items-center gap-3 cursor-pointer group ${isSessionMissing ? 'pointer-events-none opacity-50' : ''}`}>
              <input
                type="radio"
                name="visibility"
                checked={!isPublic}
                onChange={() => setIsPublic(false)}
                className="sr-only"
                disabled={isLoading || isSessionMissing}
              />
              <div className={`h-10 px-4 rounded-xl border flex items-center gap-2.5 transition-all ${
                !isPublic 
                  ? 'bg-blue-600/10 border-blue-500/50 text-blue-300 shadow-sm shadow-blue-500/10' 
                  : 'bg-white/[0.03] border-white/[0.07] text-slate-500 hover:border-white/20'
              }`}>
                <Lock className="h-3.5 w-3.5" />
                <span className="font-sans font-bold text-xs">Private</span>
              </div>
            </label>

            <label className={`flex items-center gap-3 cursor-pointer group ${isSessionMissing ? 'pointer-events-none opacity-50' : ''}`}>
              <input
                type="radio"
                name="visibility"
                checked={isPublic}
                onChange={() => setIsPublic(true)}
                className="sr-only"
                disabled={isLoading || isSessionMissing}
              />
              <div className={`h-10 px-4 rounded-xl border flex items-center gap-2.5 transition-all ${
                isPublic 
                  ? 'bg-emerald-600/10 border-emerald-500/50 text-emerald-300 shadow-sm shadow-emerald-500/10' 
                  : 'bg-white/[0.03] border-white/[0.07] text-slate-500 hover:border-white/20'
              }`}>
                <Globe className="h-3.5 w-3.5" />
                <span className="font-sans font-bold text-xs">Public</span>
              </div>
            </label>
          </div>
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
            disabled={isLoading || isSessionMissing}
            type="submit"
          >
            {isLoading ? 'Saving...' : noteId ? 'Update Note' : 'Create Note'}
          </PixelButton>
        </footer>
      </form>
    </div>,
    document.body
  )
}
