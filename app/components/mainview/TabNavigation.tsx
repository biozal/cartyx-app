import React, { useRef } from 'react'

export type TabId = 'dashboard' | 'tabletop'

export interface TabNavigationProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  className?: string
}

const TABS = [
  { id: 'dashboard' as const, label: 'Dashboard' },
  { id: 'tabletop' as const, label: 'Tabletop' },
]

export function TabNavigation({ activeTab, onTabChange, className = '' }: TabNavigationProps) {
  const tablistRef = useRef<HTMLDivElement>(null)

  function handleKeyDown(e: React.KeyboardEvent) {
    const currentIndex = TABS.findIndex(t => t.id === activeTab)
    let nextIndex = currentIndex

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      nextIndex = (currentIndex + 1) % TABS.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      nextIndex = (currentIndex - 1 + TABS.length) % TABS.length
    } else if (e.key === 'Home') {
      e.preventDefault()
      nextIndex = 0
    } else if (e.key === 'End') {
      e.preventDefault()
      nextIndex = TABS.length - 1
    } else {
      return
    }

    onTabChange(TABS[nextIndex].id)
    const buttons = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons?.[nextIndex]?.focus()
  }

  return (
    <div className={`flex items-center h-10 px-4 bg-[#080A12] border-b border-white/[0.07] ${className}`}>
      <div
        role="tablist"
        aria-label="View navigation"
        ref={tablistRef}
        onKeyDown={handleKeyDown}
        className="flex items-center gap-1"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`tab-panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onTabChange(tab.id)}
              className={`font-pixel text-xs px-4 h-10 border-b-2 transition-colors ${
                isActive
                  ? 'text-white border-[#2563EB]'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
