import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { FormInput } from '~/components/FormInput'
import { PixelButton } from '~/components/PixelButton'
import type { CampaignData } from '~/types/campaign'

type SessionData = CampaignData['sessions'][number]

interface FieldErrors {
  name?: string
  startDate?: string
}

export interface SessionModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: { name: string; startDate: string; endDate?: string }) => Promise<boolean>
  isLoading: boolean
  session?: SessionData
}

export function SessionModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
  session,
}: SessionModalProps) {
  const isEditMode = !!session

  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [hasSubmitted, setHasSubmitted] = useState(false)

  // Reset form when modal opens or session changes
  useEffect(() => {
    if (session) {
      setName(session.name)
      // session.startDate / endDate may be full ISO strings (e.g. 2026-03-01T00:00:00.000Z)
      // Normalize to YYYY-MM-DD for use with <input type="date">
      setStartDate(session.startDate.slice(0, 10))
      setEndDate(session.endDate ? session.endDate.slice(0, 10) : '')
    } else {
      setName('')
      setStartDate('')
      setEndDate('')
    }
    setError(null)
    setFieldErrors({})
    setHasSubmitted(false)
  }, [session, isOpen])

  const validate = useCallback((): FieldErrors => {
    const errors: FieldErrors = {}
    if (!name.trim()) errors.name = 'Name is required'
    if (!startDate.trim()) errors.startDate = 'Start Date is required'
    return errors
  }, [name, startDate])

  // Live-validate after first submit attempt
  useEffect(() => {
    if (hasSubmitted) {
      setFieldErrors(validate())
    }
  }, [hasSubmitted, validate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setHasSubmitted(true)
    setError(null)

    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    const trimmedEndDate = endDate.trim()
    const data: { name: string; startDate: string; endDate?: string } = {
      name: name.trim(),
      startDate: startDate.trim(),
      ...(trimmedEndDate ? { endDate: trimmedEndDate } : {}),
    }
    const success = await onSubmit(data)
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
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-modal-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-[#0D1117] border border-white/[0.07] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
      >
        {/* Header */}
        <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/[0.07] shrink-0">
          <h2
            id="session-modal-title"
            className="font-sans font-bold text-sm text-blue-400 uppercase tracking-widest"
          >
            {isEditMode ? 'Edit Session' : 'Create Session'}
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 min-h-0">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs font-semibold">
              {error}
            </div>
          )}

          <FormInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. The Lost Mine"
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

          {isEditMode && (
            <FormInput
              label="End Date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={isLoading}
            />
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-white/[0.07] bg-white/[0.01] shrink-0">
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
            {isLoading ? 'Saving...' : isEditMode ? 'Save' : 'Create'}
          </PixelButton>
        </footer>
      </form>
    </div>,
    document.body
  )
}
