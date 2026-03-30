import React, { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { ToolBar } from './ToolBar'
import type { ToolType } from './ToolBar'
import { InspectorSidebar } from './InspectorSidebar'
import { ChevronLeft } from 'lucide-react'

interface MainViewProps {
  showToolbar?: boolean
  showInspector?: boolean
  children: ReactNode
  className?: string
}

export function MainView({ showToolbar = false, showInspector = true, children, className = '' }: MainViewProps) {
  const [activeTool, setActiveTool] = useState<ToolType>('pointer')
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false)
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)

  const drawerOpen = showInspector && mobileInspectorOpen

  // Focus the drawer and attach Escape-to-close while open
  useEffect(() => {
    if (!drawerOpen) return

    drawerRef.current?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileInspectorOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [drawerOpen])

  // Reset drawer when viewport grows to lg+ so the inspector reverts to inline panel
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const handleChange = (e: MediaQueryListEvent) => {
      if (e.matches) setMobileInspectorOpen(false)
    }
    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [])

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
        {showToolbar && (
          <div className={toolbarCollapsed ? 'w-8 h-full' : 'w-14 h-full'}>
            <ToolBar
              activeTool={activeTool}
              onToolChange={setActiveTool}
              collapsed={toolbarCollapsed}
              onToggleCollapse={() => setToolbarCollapsed(c => !c)}
            />
          </div>
        )}
      </div>

      {/* Center column — Content */}
      <div className="flex-1 min-w-0 bg-[#0D1117] overflow-auto">
        {children}
      </div>

      {/* Mobile inspector toggle — always rendered on mobile when inspector is available so it can toggle open/close */}
      {showInspector && (
        <button
          type="button"
          aria-label={mobileInspectorOpen ? 'Close inspector' : 'Open inspector'}
          aria-expanded={mobileInspectorOpen}
          aria-controls="mainview-inspector"
          data-testid="mobile-inspector-toggle"
          onClick={() => setMobileInspectorOpen(o => !o)}
          className="lg:hidden fixed right-0 top-1/2 -translate-y-1/2 z-60 flex items-center justify-center h-12 w-6 rounded-l bg-[#0D1117] border border-r-0 border-white/[0.07] text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
      )}

      {/* Mobile inspector backdrop — tapping outside closes the drawer */}
      {drawerOpen && (
        <div
          aria-hidden="true"
          data-testid="mobile-inspector-backdrop"
          className="lg:hidden fixed inset-0 z-40 bg-black/50 cursor-default"
          onClick={() => setMobileInspectorOpen(false)}
        />
      )}

      {/* Inspector — single instance, inline on lg+, overlay drawer on mobile when open.
          lg: overrides on the drawerOpen branch ensure viewport resize back to lg+ snaps
          the panel back to inline flow rather than staying fixed. */}
      <div
        ref={drawerRef}
        id="mainview-inspector"
        data-testid="mainview-inspector"
        role={drawerOpen ? 'dialog' : undefined}
        aria-modal={drawerOpen ? true : undefined}
        aria-label={drawerOpen ? 'Inspector' : undefined}
        tabIndex={drawerOpen ? -1 : undefined}
        className={
          showInspector
            ? drawerOpen
              ? 'fixed inset-y-0 right-0 w-80 z-50 flex border-l border-white/[0.07] lg:relative lg:inset-auto lg:z-auto lg:flex-shrink-0 lg:overflow-hidden lg:translate-x-0'
              : 'hidden lg:flex flex-shrink-0 overflow-hidden transition-all duration-200 lg:w-80 border-l border-white/[0.07]'
            : 'hidden lg:flex flex-shrink-0 overflow-hidden transition-all duration-200 lg:w-0'
        }
      >
        {showInspector && (
          <InspectorSidebar onMobileClose={() => setMobileInspectorOpen(false)} />
        )}
      </div>
    </div>
  )
}
