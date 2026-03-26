import { Children, type ReactNode } from 'react'
import { WidgetSlot } from './WidgetSlot'

export interface DashboardWidgetConfig {
  id: string
  title: string
  content: ReactNode
  className?: string
}

export type DashboardViewProps = {
  className?: string
} & (
  | { children: ReactNode; widgets?: never }
  | { children?: never; widgets?: DashboardWidgetConfig[] }
)

export function DashboardView({ children, widgets = [], className = '' }: DashboardViewProps) {
  const childItems = Children.toArray(children)
  const hasChildren = childItems.length > 0
  const hasWidgets = widgets.length > 0

  if (!hasChildren && !hasWidgets) {
    return (
      <div className={`flex h-full items-center justify-center p-6 ${className}`}>
        <p className="font-pixel text-xs text-slate-500">No widgets yet</p>
      </div>
    )
  }

  return (
    <div className={`p-6 ${className}`}>
      <div
        data-testid="dashboard-grid"
        className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]"
      >
        {hasChildren
          ? childItems
          : widgets.map((widget) => (
            <WidgetSlot
              key={widget.id}
              title={widget.title}
              className={widget.className}
            >
              {widget.content}
            </WidgetSlot>
          ))}
      </div>
    </div>
  )
}
