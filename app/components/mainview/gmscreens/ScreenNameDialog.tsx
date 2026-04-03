import React, { useState, useRef, useEffect, useCallback } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useFocusTrap } from '~/hooks/useFocusTrap'

export interface ScreenNameDialogProps {
  title: string
  initialName: string
  onSubmit: (name: string) => void
  onCancel: () => void
  isLoading?: boolean
  error?: string | null
}

export function ScreenNameDialog({
  title,
  initialName,
  onSubmit,
  onCancel,
  isLoading = false,
  error = null,
}: ScreenNameDialogProps) {
  const [name, setName] = useState(initialName)
  const inputRef = useRef<HTMLInputElement>(null)
  const trapRef = useFocusTrap<HTMLDivElement>()

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onCancel])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed) onSubmit(trimmed)
  }, [name, onSubmit])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div ref={trapRef} className="w-full max-w-sm rounded-lg border border-white/[0.07] bg-[#0D1117] shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
          <h2 className="font-sans font-semibold text-xs text-white">{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4">
          <label className="block mb-1 font-sans text-[10px] text-slate-500 uppercase tracking-wider">
            Name
          </label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isLoading}
            maxLength={50}
            required
            autoFocus
            className="w-full rounded border border-white/[0.12] bg-[#080A12] px-3 py-2 font-sans text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-blue-500 transition-colors"
            placeholder="Enter a name..."
          />

          {error && (
            <p className="mt-2 font-sans text-[10px] text-red-400">{error}</p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="rounded px-3 py-1.5 font-sans text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim()}
              className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 font-sans text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
              {initialName ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
