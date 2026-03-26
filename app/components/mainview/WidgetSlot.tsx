import type { ReactNode } from 'react'
import { WIDGET_STYLES } from './Widget'

export interface WidgetSlotProps {
  title: string
  children: ReactNode
  className?: string
}

export function WidgetSlot({ title, children, className = '' }: WidgetSlotProps) {
  return (
    <section className={`min-h-[200px] ${WIDGET_STYLES.section} ${className}`}>
      <header className="border-b border-white/[0.07] px-4 py-3">
        <h2 className={WIDGET_STYLES.title}>{title}</h2>
      </header>

      <div className="p-4">
        {children}
      </div>
    </section>
  )
}
