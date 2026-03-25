import React from 'react'

/** Font size variant for SectionHeader. */
export type SectionHeaderSize = 'xs' | 'sm' | 'md' | 'lg'

/** Color variant for SectionHeader. */
export type SectionHeaderColor = 'blue' | 'white' | 'muted'

/** Props for the SectionHeader component. */
export interface SectionHeaderProps {
  /** Content rendered inside the header. */
  children: React.ReactNode
  /** Controls the font size. xs=10px, sm=9px, md=11px, lg=14px. Defaults to md. */
  size?: SectionHeaderSize
  /** Controls the text color. Defaults to blue. */
  color?: SectionHeaderColor
  /** Additional Tailwind tracking class (e.g. "tracking-widest", "tracking-[3px]"). */
  tracking?: string
  /** Additional CSS classes applied to the element. */
  className?: string
}

const sizeStyles: Record<SectionHeaderSize, string> = {
  xs: 'text-[10px]',
  sm: 'text-[9px]',
  md: 'text-[11px]',
  lg: 'text-[14px]',
}

const colorStyles: Record<SectionHeaderColor, string> = {
  blue: 'text-blue-400',
  white: 'text-white',
  muted: 'text-slate-500',
}

export function SectionHeader({
  children,
  size = 'md',
  color = 'blue',
  tracking = 'tracking-widest',
  className = '',
}: SectionHeaderProps) {
  return (
    <div
      className={`font-pixel ${sizeStyles[size]} ${colorStyles[color]} ${tracking} uppercase ${className}`}
    >
      {children}
    </div>
  )
}
