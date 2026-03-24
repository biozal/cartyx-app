import type { ReactNode } from 'react'

export interface WidgetSlotProps {
  title: string
  children: ReactNode
  className?: string
}

export function WidgetSlot({ title, children, className = '' }: WidgetSlotProps) {
  return (
    <section className={`min-h-[200px] rounded-lg border border-white/[0.07] bg-[#0D1117] ${className}`}>
      <header className="border-b border-white/[0.07] px-4 py-3">
        <h2 className="font-pixel text-xs text-slate-300">{title}</h2>
      </header>

      <div className="p-4">
        {children}
      </div>
    </section>
  )
}
