import React, { useState, useRef } from 'react'

export type InspectorTab = 'chat' | 'wiki' | 'notepad' | 'settings'

export interface InspectorSidebarProps {
  defaultTab?: InspectorTab
}

const tabs: { id: InspectorTab; icon: string; label: string }[] = [
  { id: 'chat', icon: '💬', label: 'Chat' },
  { id: 'wiki', icon: '📚', label: 'Wiki' },
  { id: 'notepad', icon: '📝', label: 'Notepad' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
]

export function InspectorSidebar({ defaultTab = 'chat' }: InspectorSidebarProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>(defaultTab)
  const tablistRef = useRef<HTMLDivElement>(null)

  const activeTabLabel = tabs.find((t) => t.id === activeTab)?.label ?? ''
  const panelId = `inspector-panel-${activeTab}`

  function handleKeyDown(e: React.KeyboardEvent) {
    const currentIndex = tabs.findIndex(t => t.id === activeTab)
    let nextIndex = currentIndex

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      nextIndex = (currentIndex + 1) % tabs.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
    } else if (e.key === 'Home') {
      e.preventDefault()
      nextIndex = 0
    } else if (e.key === 'End') {
      e.preventDefault()
      nextIndex = tabs.length - 1
    } else {
      return
    }

    setActiveTab(tabs[nextIndex].id)
    const buttons = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons?.[nextIndex]?.focus()
  }

  return (
    <div className="flex flex-col h-full bg-[#0D1117]">
      {/* Tab bar */}
      <div
        className="flex h-12 border-b border-white/[0.07] flex-shrink-0"
        role="tablist"
        aria-label="Inspector panels"
        ref={tablistRef}
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab
          const tabId = `inspector-tab-${tab.id}`
          return (
            <button
              key={tab.id}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId}
              aria-label={tab.label}
              tabIndex={isActive ? 0 : -1}
              data-testid={tabId}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex flex-1 items-center justify-center text-base transition-colors relative',
                isActive
                  ? "text-[#60A5FA] after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#60A5FA]"
                  : 'text-slate-500 hover:text-slate-300',
              ].join(' ')}
            >
              {tab.icon}
            </button>
          )
        })}
      </div>

      {/* Panel content */}
      <div
        id={panelId}
        data-testid="inspector-panel"
        role="tabpanel"
        aria-labelledby={`inspector-tab-${activeTab}`}
        className="flex flex-1 items-center justify-center"
      >
        <span className="font-pixel text-xs text-slate-600">
          {activeTabLabel} — Coming Soon
        </span>
      </div>
    </div>
  )
}
