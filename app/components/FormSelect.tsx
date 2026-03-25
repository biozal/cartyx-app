import React, { useId } from 'react'

/** A single option in the select dropdown. */
export interface SelectOption {
  value: string
  label: string
}

/** Props for the FormSelect component. */
export interface FormSelectProps {
  /** Label content rendered above the select. */
  label?: React.ReactNode
  /** Controlled selected value. */
  value: string
  /** Change handler. */
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  /** List of options to render. */
  options: SelectOption[]
  /** Whether the select is disabled. */
  disabled?: boolean
  /** Additional CSS classes applied to the label. */
  labelClassName?: string
  /** Additional CSS classes applied to the wrapper. */
  className?: string
}

export function FormSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
  labelClassName = '',
  className = '',
}: FormSelectProps) {
  const generatedId = useId()
  const selectId = `form-select-${generatedId}`
  const selectCls = [
    'w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-slate-200 text-sm',
    'focus:outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer',
    disabled ? 'opacity-50 cursor-not-allowed' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className}>
      {label && (
        <label htmlFor={selectId} className={`block text-xs font-semibold text-slate-400 mb-2 tracking-wide ${labelClassName}`.trim()}>
          {label}
        </label>
      )}
      <select
        id={selectId}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={selectCls}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-[#0D1117]">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
