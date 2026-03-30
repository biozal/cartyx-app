import React, { useState, useEffect, useRef, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { ToolBar } from './ToolBar'
import type { ToolType } from './ToolBar'
import { InspectorSidebar } from './InspectorSidebar'
import { ChevronLeft } from 'lucide-react'

const LG_QUERY = '(min-width: 1024px)'

function subscribeToDesktop(callback: () => void) {
  const mq = window.matchMedia(LG_QUERY)
  mq.addEventListener('change', callback)
  return () => mq.removeEventListener('change', callback)
}

function getDesktopSnapshot() {
  return window.matchMedia(LG_QUERY).matches
}

function getDesktopServerSnapshot() {
  return false
}

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
  const isDesktop = useSyncExternalStore(
    subscribeToDesktop,
    getDesktopSnapshot,
    getDesktopServerSnapshot,
  )
  const drawerRef = useRef<HTMLDivElement>(null)

  const drawerOpen = showInspector && mobileInspectorOpen
  const desktopInspectorToggleLabel = inspectorVisible ? 'Close inspector' : 'Open inspector'
  const mobileInspectorToggleLabel = mobileInspectorOpen ? 'Close inspector' : 'Open inspector'
  const desktopInspectorToggleIconClass = `inline-flex transition-transform duration-200 ${inspectorVisible ? 'rotate-180' : 'rotate-0'}`
  const mobileInspectorToggleIconClass = `inline-flex transition-transform duration-200 ${mobileInspectorOpen ? 'rotate-180' : 'rotate-0'}`

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

  // Reset mobile drawer when viewport grows to lg+
  useEffect(() => {
    if (isDesktop) setMobileInspectorOpen(false)
  }, [isDesktop])

  const handleInspectorToggle = () => {
    if (isDesktop) {
      setInspectorVisible(v => !v)
    } else {
      setMobileInspectorOpen(o => !o)
    }
  }

  const mobileInspectorClass = drawerOpen
    ? 'fixed inset-y-0 right-0 z-50 flex w-80 border-l border-white/[0.07]'
    : 'hidden'

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

      {/* Desktop inspector shell — animate width like the toolbar collapse rail */}
      {showInspector && (
        <div
          data-testid="desktop-inspector-shell"
          className={`relative hidden w-0 flex-shrink-0 transition-[width] duration-200 lg:block ${inspectorVisible ? 'lg:w-80' : 'lg:w-0'}`}
        >
          <button
            type="button"
            aria-label={desktopInspectorToggleLabel}
            aria-expanded={inspectorVisible}
            aria-controls="mainview-inspector-desktop"
            data-testid="desktop-inspector-toggle"
            onClick={handleInspectorToggle}
            title={desktopInspectorToggleLabel}
            className="absolute left-0 top-1/2 z-10 flex h-12 w-6 -translate-x-full -translate-y-1/2 items-center justify-center rounded-l border border-r-0 border-white/[0.07] bg-[#0D1117] text-slate-400 transition-colors hover:text-slate-200"
          >
            <span data-testid="desktop-inspector-toggle-icon" className={desktopInspectorToggleIconClass}>
              <ChevronLeft size={14} />
            </span>
          </button>

          <div
            id="mainview-inspector-desktop"
            data-testid="desktop-inspector"
            className={`h-full w-80 overflow-hidden bg-[#0D1117] ${inspectorVisible ? 'flex border-l border-white/[0.07]' : 'hidden lg:hidden'}`}
          >
            <InspectorSidebar />
          </div>
        </div>
      )}

      {/* Mobile inspector toggle — remains a floating drawer control */}
      {showInspector && (
        <button
          type="button"
          aria-label={mobileInspectorToggleLabel}
          aria-expanded={mobileInspectorOpen}
          aria-controls="mainview-inspector-mobile"
          data-testid="mobile-inspector-toggle"
          onClick={handleInspectorToggle}
          title={mobileInspectorToggleLabel}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-[60] flex h-12 w-6 items-center justify-center rounded-l border border-r-0 border-white/[0.07] bg-[#0D1117] text-slate-400 transition-colors hover:text-slate-200 lg:hidden"
        >
          <span data-testid="mobile-inspector-toggle-icon" className={mobileInspectorToggleIconClass}>
            <ChevronLeft size={14} />
          </span>
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
      {showInspector && (
        <div
          ref={drawerRef}
          id="mainview-inspector-mobile"
          data-testid="mobile-inspector"
          role={drawerOpen ? 'dialog' : undefined}
          aria-modal={drawerOpen ? true : undefined}
          aria-label={drawerOpen ? 'Inspector' : undefined}
          tabIndex={drawerOpen ? -1 : undefined}
          className={`${mobileInspectorClass} lg:hidden`}
        >
          <InspectorSidebar onMobileClose={() => setMobileInspectorOpen(false)} />
        </div>
      )}
    </div>
  )
}
