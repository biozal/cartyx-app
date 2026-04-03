import React, { useState, useEffect, useMemo, useCallback, useId } from 'react'
import { createPortal } from 'react-dom'
import { X, Globe, Lock, AlertCircle } from 'lucide-react'
import { FormInput } from '~/components/FormInput'
import { FormSelect } from '~/components/FormSelect'
import { PixelButton } from '~/components/PixelButton'
import { MarkdownEditor } from '~/components/shared/MarkdownEditor'
import type { CampaignData } from '~/types/campaign'
import { useCreateNote, useUpdateNote, useDeleteNote, useNote } from '~/hooks/useNotes'

interface NoteModalProps {
  isOpen: boolean
  onClose: () => void
  campaignId: string
  noteId?: string
  sessions: CampaignData['sessions']
  defaultSessionId?: string
}

interface FieldErrors {
  title?: string
  sessionId?: string
  content?: string
}

export function NoteModal({
  isOpen,
  onClose,
  campaignId,
  noteId,
  sessions,
  defaultSessionId,
}: NoteModalProps) {
  const { note: fetchedNote, isLoading: isFetchingNote } = useNote(noteId ?? '', campaignId)
  const { create, isLoading: isCreating } = useCreateNote()
  const { update, isLoading: isUpdating } = useUpdateNote()
  const { remove, isLoading: isDeleting } = useDeleteNote()

  const [title, setTitle] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const tagInputId = useId()

  // Reset form to blank when switching noteId or opening the modal,
  // so stale values from a previous note never flash.
  useEffect(() => {
    setTitle('')
    setSessionId(noteId ? '' : defaultSessionId || sessions[0]?.id || '')
    setContent('')
    setTags([])
    setIsPublic(false)
    setTagInput('')
    setError(null)
    setFieldErrors({})
    setHasSubmitted(false)
    setShowDeleteConfirm(false)
  }, [noteId, defaultSessionId, sessions, isOpen])

  // Populate form once the fetched note resolves in edit mode
  useEffect(() => {
    if (noteId && fetchedNote) {
      setTitle(fetchedNote.title)
      setSessionId(fetchedNote.sessionId)
      setContent(fetchedNote.note)
      setTags(fetchedNote.tags)
      setIsPublic(fetchedNote.isPublic)
    }
  }, [noteId, fetchedNote])

  const sessionOptions = useMemo(() => sessions.map((s) => ({
    value: s.id,
    label: `Session ${s.number}: ${s.name}`,
  })), [sessions])

  const isSessionMissing = sessions.length === 0

  const validate = useCallback((): FieldErrors => {
    const errors: FieldErrors = {}
    if (!title.trim()) errors.title = 'Title is required'
    if (!sessionId) errors.sessionId = 'Session is required'
    if (!content.trim()) errors.content = 'Note body is required'
    return errors
  }, [title, sessionId, content])

  useEffect(() => {
    if (hasSubmitted) {
      setFieldErrors(validate())
    }
  }, [hasSubmitted, validate])

  const addTag = useCallback((raw: string) => {
    const cleaned = raw.replace(/^#/, '').trim().toLowerCase()
    if (cleaned) {
      setTags((prev) => (prev.includes(cleaned) ? prev : [...prev, cleaned]))
    }
    setTagInput('')
  }, [])

  const handleTagKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(tagInput)
    } else if (e.key === 'Backspace' && tagInput === '') {
      setTags((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev))
    }
  }, [tagInput, addTag])

  const removeTag = useCallback((tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSessionMissing) return

    setHasSubmitted(true)
    setError(null)

    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    // Flush any pending tag input into state so it's visible and not reprocessed
    const pendingTag = tagInput.replace(/^#/, '').trim().toLowerCase()
    let finalTags = tags
    if (pendingTag) {
      const merged = tags.includes(pendingTag) ? tags : [...tags, pendingTag]
      setTags(merged)
      setTagInput('')
      finalTags = merged
    }

    const input = {
      campaignId,
      sessionId,
      title: title.trim(),
      note: content.trim(),
      tags: finalTags,
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

  const handleDelete = async () => {
    if (!noteId) return
    setError(null)
    const result = await remove({ id: noteId, campaignId })
    if (result) {
      onClose()
    } else {
      setError('Failed to delete note. Please try again.')
      setShowDeleteConfirm(false)
    }
  }

  if (!isOpen) return null

  const isLoadingNote = !!(noteId && isFetchingNote)
  const isSaving = isCreating || isUpdating
  const isDisabled = isLoadingNote || isSaving || isDeleting

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-2 sm:p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="note-modal-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full h-full max-w-[90vw] max-h-[90vh] sm:max-w-[90vw] sm:max-h-[90vh] bg-[#0D1117] border border-white/[0.07] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
      >
        <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/[0.07] shrink-0">
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

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 min-h-0">
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
              disabled={isDisabled || isSessionMissing}
              error={fieldErrors.title}
            />
            <FormSelect
              label="Session"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              options={sessionOptions}
              disabled={isDisabled || isSessionMissing}
            />
          </div>

          {fieldErrors.sessionId && (
            <p className="text-xs text-red-400 -mt-3" role="alert">{fieldErrors.sessionId}</p>
          )}

          <MarkdownEditor
            label="Note"
            value={content}
            onChange={setContent}
            placeholder="What happened? What did you discover?..."
            disabled={isDisabled || isSessionMissing}
            error={fieldErrors.content}
            minHeight="16rem"
            id="note-modal-editor"
          />

          {/* Tag chips input */}
          <div>
            <label htmlFor={tagInputId} className="block text-xs font-semibold text-slate-400 mb-2 tracking-wide">
              Tags
            </label>
            <div
              className={[
                'flex flex-wrap items-center gap-1.5 bg-white/[0.04] border rounded-xl px-3 py-2 min-h-[44px] transition-all',
                'focus-within:border-blue-500/50 border-white/10',
                (isDisabled || isSessionMissing) ? 'opacity-50 cursor-not-allowed' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => document.getElementById(tagInputId)?.focus()}
            >
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-sans font-bold text-[11px] tracking-tight"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeTag(tag)
                    }}
                    className="ml-0.5 text-blue-400/60 hover:text-blue-300 transition-colors"
                    aria-label={`Remove tag ${tag}`}
                    disabled={isDisabled || isSessionMissing}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                id={tagInputId}
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={() => {
                  if (tagInput.trim()) addTag(tagInput)
                }}
                placeholder={tags.length === 0 ? 'Type a tag and press Enter' : ''}
                disabled={isDisabled || isSessionMissing}
                className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-slate-200 text-sm placeholder-slate-700"
                aria-label="Add tag"
              />
            </div>
            <p className="text-xs text-slate-700 mt-1.5">
              Tags are displayed with # prefix. Press Enter or comma to add.
            </p>
          </div>

          <div className="flex items-center gap-6 pt-2">
            <label className={`flex items-center gap-3 cursor-pointer group ${isSessionMissing ? 'pointer-events-none opacity-50' : ''}`}>
              <input
                type="radio"
                name="visibility"
                checked={!isPublic}
                onChange={() => setIsPublic(false)}
                className="sr-only"
                disabled={isDisabled || isSessionMissing}
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
                disabled={isDisabled || isSessionMissing}
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

        <footer className="flex items-center justify-between px-4 sm:px-6 py-4 border-t border-white/[0.07] bg-white/[0.01] shrink-0">
          <div>
            {noteId && !showDeleteConfirm && (
              <PixelButton
                variant="secondary"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDisabled}
                type="button"
              >
                <span className="text-rose-400">Delete</span>
              </PixelButton>
            )}
            {noteId && showDeleteConfirm && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-400 font-semibold">Delete this note?</span>
                <PixelButton
                  variant="secondary"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  type="button"
                >
                  <span className="text-rose-400">{isDeleting ? 'Deleting...' : 'Yes, delete'}</span>
                </PixelButton>
                <PixelButton
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  type="button"
                >
                  Cancel
                </PixelButton>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <PixelButton
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={isSaving || isDeleting}
              type="button"
            >
              Cancel
            </PixelButton>
            <PixelButton
              variant="primary"
              size="sm"
              disabled={isDisabled || isSessionMissing}
              type="submit"
            >
              {isSaving ? 'Saving...' : isLoadingNote ? 'Loading...' : noteId ? 'Update Note' : 'Create Note'}
            </PixelButton>
          </div>
        </footer>
      </form>
    </div>,
    document.body
  )
}
