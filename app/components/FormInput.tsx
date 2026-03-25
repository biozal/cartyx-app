import React, { useId } from 'react'

/** Props for the FormInput component. */
export interface FormInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  /** Label content rendered above the input. */
  label?: React.ReactNode
  /** HTML input type (text, url, email, time, etc.). Defaults to "text". */
  type?: string
  /** Controlled value. */
  value: string
  /** Change handler. */
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  /** Error message — renders red border and text below input. */
  error?: string
  /** Optional helper text rendered below input (e.g. character count). */
  hint?: string
  /** Align hint text. Defaults to "left". */
  hintAlign?: 'left' | 'right'
  /** Additional CSS classes applied to the label. */
  labelClassName?: string
  /** Additional CSS classes applied to the wrapper div. */
  className?: string
}

export function FormInput({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled = false,
  error,
  hint,
  hintAlign = 'left',
  labelClassName = '',
  className = '',
  ...rest
}: FormInputProps) {
  const generatedId = useId()
  const inputId = rest.id ?? generatedId
  const inputCls = [
    'w-full bg-white/[0.04] border rounded-xl px-4 py-3 text-slate-200 text-sm',
    'placeholder-slate-700 focus:outline-none focus:bg-white/[0.06] transition-all',
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
        <label htmlFor={inputId} className={`block text-xs font-semibold text-slate-400 mb-2 tracking-wide ${labelClassName}`.trim()}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={inputCls}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      {error && (
        <p id={`${inputId}-error`} className="text-xs text-red-400 mt-1.5" role="alert">{error}</p>
      )}
      {!error && hint && (
        <p id={`${inputId}-hint`} className={`text-xs text-slate-700 mt-1.5${hintAlign === 'right' ? ' text-right' : ''}`}>{hint}</p>
      )}
    </div>
  )
}
