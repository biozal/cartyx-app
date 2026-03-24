import React, { useState } from 'react'
import type { ReactNode } from 'react'
import { ToolBar } from './ToolBar'
import type { ToolType } from './ToolBar'

interface MainViewProps {
  showToolbar?: boolean
  showInspector?: boolean
  children: ReactNode
  className?: string
}

export function MainView({ showToolbar = false, showInspector = true, children, className = '' }: MainViewProps) {
  const [activeTool, setActiveTool] = useState<ToolType>('pointer')
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false)

  return (
    <div className={`flex h-full bg-[#080A12] overflow-hidden ${className}`}>
      {/* Left column — Toolbar */}
      <div
        data-testid="mainview-toolbar"
        className={`flex-shrink-0 overflow-hidden transition-all duration-200 ${
          showToolbar
            ? `${toolbarCollapsed ? 'w-8' : 'w-14'} border-r border-white/[0.07]`
            : 'w-0'
        }`}
      >
        <div className={toolbarCollapsed ? 'w-8 h-full' : 'w-14 h-full'}>
          <ToolBar
            activeTool={activeTool}
            onToolChange={setActiveTool}
            collapsed={toolbarCollapsed}
            onToggleCollapse={() => setToolbarCollapsed(c => !c)}
          />
        </div>
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
