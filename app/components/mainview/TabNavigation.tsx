import React, { useRef } from 'react'

export type TabId = 'dashboard' | 'tabletop'

export interface TabNavigationProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  className?: string
}

export const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'dashboard' as const, label: 'Dashboard' },
  { id: 'tabletop' as const, label: 'Tabletop' },
]

export function handleTabsKeyDown(
  e: React.KeyboardEvent,
  activeTab: TabId,
  onTabChange: (tab: TabId) => void,
  tablistRef: React.RefObject<HTMLDivElement | null>,
  tabs: ReadonlyArray<{ id: TabId; label: string }> = TABS,
) {
  const focused = e.target as HTMLElement
  const buttons = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  const currentIndex = buttons
    ? Array.from(buttons).indexOf(focused as HTMLButtonElement)
    : tabs.findIndex(t => t.id === activeTab)
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

  onTabChange(tabs[nextIndex].id)
  buttons?.[nextIndex]?.focus()
}

export function TabNavigation({ activeTab, onTabChange, className = '' }: TabNavigationProps) {
  const tablistRef = useRef<HTMLDivElement>(null)

  return (
    <div className={`flex items-center h-10 px-4 bg-[#080A12] border-b border-white/[0.07] ${className}`}>
      <div
        role="tablist"
        aria-label="View navigation"
        ref={tablistRef}
        onKeyDown={(e) => handleTabsKeyDown(e, activeTab, onTabChange, tablistRef)}
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
              className={`font-sans font-semibold text-xs px-4 h-10 border-b-2 transition-colors ${
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
