import type { ReactNode } from 'react'

interface MainViewProps {
  showToolbar?: boolean
  showInspector?: boolean
  children: ReactNode
  className?: string
}

export function MainView({ showToolbar = false, showInspector = true, children, className = '' }: MainViewProps) {
  return (
    <div className={`flex h-full bg-[#080A12] overflow-hidden ${className}`}>
      {/* Left column — Toolbar */}
      <div
        data-testid="mainview-toolbar"
        className={`flex-shrink-0 overflow-hidden transition-all duration-200 ${
          showToolbar ? 'w-14 border-r border-white/[0.07]' : 'w-0'
        }`}
      >
        <div className="w-14 h-full" />
      </div>

      {/* Center column — Content */}
      <div className="flex-1 min-w-0 bg-[#0D1117] overflow-auto">
        {children}
      </div>

      {/* Right column — Inspector */}
      <div
        data-testid="mainview-inspector"
        className={`flex-shrink-0 overflow-hidden transition-all duration-200 ${
          showInspector ? 'w-80 border-l border-white/[0.07]' : 'w-0'
        }`}
      >
        <div className="w-80 h-full" />
      </div>
    </div>
  )
}
