import { useState, useCallback, useEffect, useRef } from 'react'
import { X, GripVertical, ArrowUp, ArrowDown, Loader2 } from 'lucide-react'
import type { GMScreenData } from '~/server/functions/gmscreens'
import { useFocusTrap } from '~/hooks/useFocusTrap'

export interface ReorderDialogProps {
  screens: GMScreenData[]
  onSubmit: (screenIds: string[]) => void | Promise<void>
  onCancel: () => void
  isLoading?: boolean
}

export function ReorderDialog({
  screens,
  onSubmit,
  onCancel,
  isLoading = false,
}: ReorderDialogProps) {
  const [order, setOrder] = useState(() => [...screens].sort((a, b) => a.tabOrder - b.tabOrder))
  const trapRef = useFocusTrap<HTMLDivElement>()
  const submittingRef = useRef(false)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onCancel])

  const moveUp = useCallback((index: number) => {
    if (index <= 0) return
    setOrder(prev => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
  }, [])

  const moveDown = useCallback((index: number) => {
    setOrder(prev => {
      if (index >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
  }, [])

  const handleSubmit = useCallback(() => {
    if (submittingRef.current) return
    submittingRef.current = true
    Promise.resolve(onSubmit(order.map(s => s.id))).finally(() => {
      submittingRef.current = false
    })
  }, [order, onSubmit])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
      role="dialog"
      aria-modal="true"
      aria-label="Reorder Screens"
    >
      <div ref={trapRef} className="w-full max-w-sm rounded-lg border border-white/[0.07] bg-[#0D1117] shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
          <h2 className="font-sans font-semibold text-xs text-white">Reorder Screens</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          <ul className="space-y-1" role="list" aria-label="Screen order">
            {order.map((screen, index) => (
              <li
                key={screen.id}
                className="flex items-center gap-2 rounded border border-white/[0.07] bg-[#080A12] px-3 py-2"
              >
                <GripVertical className="h-3.5 w-3.5 text-slate-600 shrink-0" aria-hidden="true" />
                <span className="flex-1 font-sans text-xs text-slate-300 truncate">{screen.name}</span>
                <button
                  type="button"
                  onClick={() => moveUp(index)}
                  disabled={index === 0 || isLoading}
                  aria-label={`Move ${screen.name} up`}
                  className="p-0.5 text-slate-500 hover:text-slate-300 disabled:text-slate-700 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(index)}
                  disabled={index === order.length - 1 || isLoading}
                  aria-label={`Move ${screen.name} down`}
                  className="p-0.5 text-slate-500 hover:text-slate-300 disabled:text-slate-700 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>

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
              type="button"
              onClick={handleSubmit}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 font-sans text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
              Save Order
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
