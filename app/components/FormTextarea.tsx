import React from 'react'

/** Props for the FormTextarea component. */
export interface FormTextareaProps {
  /** Label content rendered above the textarea. */
  label?: React.ReactNode
  /** Controlled value. */
  value: string
  /** Change handler. */
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  /** Placeholder text. */
  placeholder?: string
  /** Number of visible rows. */
  rows?: number
  /** Maximum character length — shows a character count when provided. */
  maxLength?: number
  /** Whether the textarea is disabled. */
  disabled?: boolean
  /** Error message — renders red border and text below textarea. */
  error?: string
  /** Additional CSS classes applied to the wrapper. */
  className?: string
}

export function FormTextarea({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  maxLength,
  disabled = false,
  error,
  className = '',
}: FormTextareaProps) {
  const nearLimit = maxLength !== undefined && value.length > maxLength * 0.9

  const textareaCls = [
    'w-full bg-white/[0.04] border rounded-xl px-4 py-3 text-slate-200 text-sm',
    'placeholder-slate-700 focus:outline-none focus:bg-white/[0.06] transition-all resize-y',
    error
      ? 'border-red-500/50 focus:border-red-500/70'
      : 'border-white/10 focus:border-blue-500/50',
    disabled ? 'opacity-50 cursor-not-allowed' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-semibold text-slate-400 mb-2 tracking-wide">
          {label}
        </label>
      )}
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        className={textareaCls}
      />
      {error && (
        <p className="text-xs text-red-400 mt-1.5">{error}</p>
      )}
      {!error && maxLength !== undefined && (
        <p className={`text-xs mt-1.5 text-right ${nearLimit ? 'text-amber-500' : 'text-slate-700'}`}>
          {value.length}/{maxLength}
        </p>
      )}
    </div>
  )
}
