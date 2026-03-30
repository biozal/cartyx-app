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
  const [inspectorVisible, setInspectorVisible] = useState(true)
  const [isDesktop, setIsDesktop] = useState(false)
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

  // Track desktop breakpoint; reset mobile drawer when viewport grows to lg+
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    setIsDesktop(mq.matches)
    const handleChange = (e: MediaQueryListEvent) => {
      setIsDesktop(e.matches)
      if (e.matches) setMobileInspectorOpen(false)
    }
    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [])

  const handleInspectorToggle = () => {
    if (isDesktop) {
      setInspectorVisible(v => !v)
    } else {
      setMobileInspectorOpen(o => !o)
    }
  }

  // Reflects whether the inspector is currently accessible in the active viewport context
  const isInspectorOpen = isDesktop ? inspectorVisible : mobileInspectorOpen

  const inspectorClass = (() => {
    if (!showInspector) return 'hidden'

    const mobileBase = drawerOpen
      ? 'fixed inset-y-0 right-0 w-80 z-50 flex border-l border-white/[0.07]'
      : 'hidden'

    const desktopOverride = inspectorVisible
      ? 'lg:relative lg:inset-auto lg:z-auto lg:flex lg:flex-shrink-0 lg:overflow-hidden lg:w-80 lg:border-l lg:border-white/[0.07]'
      : 'lg:hidden'

    return `${mobileBase} ${desktopOverride}`
  })()

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

      {/* Inspector toggle — visible at all screen sizes */}
      {showInspector && (
        <button
          type="button"
          aria-label={isInspectorOpen ? 'Close inspector' : 'Open inspector'}
          aria-expanded={isInspectorOpen}
          aria-controls="mainview-inspector"
          data-testid="inspector-toggle"
          onClick={handleInspectorToggle}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-60 flex items-center justify-center h-12 w-6 rounded-l bg-[#0D1117] border border-r-0 border-white/[0.07] text-slate-400 hover:text-slate-200 transition-colors"
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

      {/* Inspector — single instance, overlay drawer on mobile when open, inline on lg+ */}
      <div
        ref={drawerRef}
        id="mainview-inspector"
        data-testid="mainview-inspector"
        role={drawerOpen ? 'dialog' : undefined}
        aria-modal={drawerOpen ? true : undefined}
        aria-label={drawerOpen ? 'Inspector' : undefined}
        tabIndex={drawerOpen ? -1 : undefined}
        className={inspectorClass}
      >
        {showInspector && (
          <InspectorSidebar onMobileClose={() => setMobileInspectorOpen(false)} />
        )}
      </div>
    </div>
  )
}
