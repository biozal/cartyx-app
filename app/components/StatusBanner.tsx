import React from 'react'

/** Visual style variant of the banner. */
export type StatusBannerVariant = 'error' | 'warning' | 'info' | 'success'

/** Props for the StatusBanner component. */
export interface StatusBannerProps {
  /** Controls the color scheme of the banner. */
  variant: StatusBannerVariant
  /** The message to display. */
  message: string
  /** When true and onDismiss is provided, renders a dismiss button. */
  dismissible?: boolean
  /** Called when the dismiss button is clicked. Required when dismissible is true. */
  onDismiss?: () => void
  /** Additional CSS classes applied to the banner. */
  className?: string
}

const variantStyles: Record<StatusBannerVariant, string> = {
  error: 'bg-red-500/10 border-red-500/30 text-red-400',
  warning: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  info: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  success: 'bg-green-500/10 border-green-500/30 text-green-400',
}

export function StatusBanner({
  variant,
  message,
  dismissible = false,
  onDismiss,
  className = '',
}: StatusBannerProps) {
  return (
    <div
      className={`px-4 py-3 rounded-xl border text-sm flex items-start justify-between gap-3 ${variantStyles[variant]} ${className}`}
      role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'}
    >
      <span>{message}</span>
      {dismissible && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity leading-none text-base"
        >
          ×
        </button>
      )}
    </div>
  )
}
