import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Pencil, Trash2, X, GripVertical } from 'lucide-react'
import type { StackData, HydratedDocument } from '~/server/functions/gmscreens'

export interface StackCardProps {
  stack: StackData
  hydrated: Record<string, HydratedDocument>
  onRename: (stackId: string, name: string) => void
  onDelete: (stackId: string) => void
  onRemoveItem: (stackId: string, itemId: string) => void
  onOpenItem: (collection: string, documentId: string) => void
  /** When true, disable absolute positioning so the card flows in a flex/scroll container (mobile). */
  inFlowLayout?: boolean
}

export function StackCard({
  stack,
  hydrated,
  onRename,
  onDelete,
  onRemoveItem,
  onOpenItem,
  inFlowLayout = false,
}: StackCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(stack.name)
  const inputRef = useRef<HTMLInputElement>(null)

  // Select all text when entering edit mode
  useEffect(() => {
    if (isEditing) inputRef.current?.select()
  }, [isEditing])

  const handleStartEdit = useCallback(() => {
    setEditName(stack.name)
    setIsEditing(true)
  }, [stack.name])

  const handleSubmitRename = useCallback(() => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== stack.name) {
      onRename(stack.id, trimmed)
    }
    setIsEditing(false)
  }, [editName, stack.id, stack.name, onRename])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmitRename()
    if (e.key === 'Escape') setIsEditing(false)
  }, [handleSubmitRename])

  return (
    <div
      data-testid={`stack-card-${stack.id}`}
      className="w-56 rounded-lg border border-white/[0.07] bg-[#0D1117] shadow-lg shadow-black/40 overflow-hidden"
      style={!inFlowLayout && stack.x != null && stack.y != null ? {
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate(${stack.x}px, ${stack.y}px)`,
      } : undefined}
    >
      {/* Header */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/[0.07] bg-[#1a1d2e]">
        <GripVertical className="h-3 w-3 text-slate-600 shrink-0 cursor-grab" aria-hidden="true" />

        {isEditing ? (
          <input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSubmitRename}
            onKeyDown={handleKeyDown}
            className="flex-1 min-w-0 bg-transparent font-sans font-semibold text-xs text-slate-200 outline-none border-b border-blue-500"
            aria-label="Stack name"
          />
        ) : (
          <span className="flex-1 truncate font-sans font-semibold text-xs text-slate-300">
            {stack.name}
          </span>
        )}

        <button
          type="button"
          onClick={handleStartEdit}
          aria-label={`Rename ${stack.name}`}
          className="shrink-0 p-0.5 text-slate-500 hover:text-slate-300 transition-colors"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(stack.id)}
          aria-label={`Delete ${stack.name}`}
          className="shrink-0 p-0.5 text-slate-500 hover:text-red-400 transition-colors"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* Items */}
      <div className="max-h-48 overflow-y-auto">
        {stack.items.length === 0 ? (
          <p className="px-3 py-3 text-center font-sans text-[10px] text-slate-600">
            No items yet
          </p>
        ) : (
          <ul className="py-1">
            {stack.items.map((item) => {
              const key = `${item.collection}:${item.documentId}`
              const doc = hydrated[key]
              const displayLabel = doc?.title || item.label || key

              return (
                <li
                  key={item.id}
                  className="group flex items-center gap-1 px-2 py-1 hover:bg-white/[0.03]"
                >
                  <button
                    type="button"
                    onClick={() => onOpenItem(item.collection, item.documentId)}
                    className="flex-1 min-w-0 truncate text-left font-sans text-xs text-slate-400 hover:text-slate-200 transition-colors"
                    title={displayLabel}
                  >
                    {displayLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(stack.id, item.id)}
                    aria-label={`Remove ${displayLabel}`}
                    className="shrink-0 p-0.5 text-slate-600 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
