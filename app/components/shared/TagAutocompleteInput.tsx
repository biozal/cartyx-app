// app/components/shared/TagAutocompleteInput.tsx
import React, { useState, useRef, useCallback, useId, useEffect } from 'react'
import { X } from 'lucide-react'
import { useTags } from '~/hooks/useTags'

interface TagAutocompleteInputProps {
  campaignId: string
  selectedTags: string[]
  onTagsChange: (tags: string[]) => void
  placeholder?: string
  disabled?: boolean
}

export function TagAutocompleteInput({
  campaignId,
  selectedTags,
  onTagsChange,
  placeholder = 'Type a tag and press Enter',
  disabled = false,
}: TagAutocompleteInputProps) {
  const { tags: allTags } = useTags(campaignId)
  const [input, setInput] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputId = useId()

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current)
    }
  }, [])

  const suggestions = allTags
    .filter((t) => !selectedTags.includes(t.name))
    .filter((t) => input.trim() === '' ? false : t.name.startsWith(input.trim().toLowerCase().replace(/^#/, '')))

  // Reset highlight when suggestions change
  useEffect(() => {
    setHighlightIndex(-1)
  }, [suggestions.length, input])

  const addTag = useCallback((raw: string) => {
    const cleaned = raw.replace(/^#/, '').trim().toLowerCase()
    if (cleaned && !selectedTags.includes(cleaned)) {
      onTagsChange([...selectedTags, cleaned])
    }
    setInput('')
    setIsOpen(false)
  }, [selectedTags, onTagsChange])

  const removeTag = useCallback((tag: string) => {
    onTagsChange(selectedTags.filter((t) => t !== tag))
  }, [selectedTags, onTagsChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (suggestions.length > 0) {
        setIsOpen(true)
        setHighlightIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0))
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (suggestions.length > 0) {
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1))
      }
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
        addTag(suggestions[highlightIndex].name)
      } else if (input.trim()) {
        addTag(input)
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      setHighlightIndex(-1)
    } else if (e.key === 'Backspace' && input === '') {
      if (selectedTags.length > 0) {
        onTagsChange(selectedTags.slice(0, -1))
      }
    }
  }, [input, highlightIndex, suggestions, addTag, selectedTags, onTagsChange])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
    setIsOpen(true)
  }, [])

  const handleBlur = useCallback(() => {
    // Delay to allow click on dropdown item to fire first
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current)
    blurTimeoutRef.current = setTimeout(() => {
      if (input.trim()) {
        addTag(input)
      }
      setIsOpen(false)
      setHighlightIndex(-1)
    }, 150)
  }, [input, addTag])

  return (
    <div className="relative">
      <div
        className={[
          'flex flex-wrap items-center gap-1.5 bg-[#080A12] border rounded px-3 py-2 transition-all',
          'focus-within:border-blue-500/50 border-white/[0.07]',
          disabled ? 'opacity-50 cursor-not-allowed' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => inputRef.current?.focus()}
      >
        {selectedTags.map((tag) => (
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
              disabled={disabled}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={() => { if (input.trim()) setIsOpen(true) }}
          placeholder={selectedTags.length === 0 ? placeholder : ''}
          disabled={disabled}
          className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-slate-200 text-sm placeholder-slate-700"
          aria-label="Add tag"
          autoComplete="off"
        />
      </div>

      {isOpen && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 left-0 right-0 mt-1 bg-[#0f1520] border border-white/10 rounded-lg py-1 shadow-2xl max-h-48 overflow-y-auto"
        >
          <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Suggestions
          </div>
          {suggestions.map((tag, index) => (
            <button
              key={tag.id}
              type="button"
              className={[
                'w-full text-left px-3 py-1.5 text-xs font-semibold transition-colors',
                index === highlightIndex
                  ? 'bg-blue-500/10 text-slate-200'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
              ].join(' ')}
              onMouseDown={(e) => {
                e.preventDefault()
                addTag(tag.name)
              }}
              onMouseEnter={() => setHighlightIndex(index)}
            >
              #{tag.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
