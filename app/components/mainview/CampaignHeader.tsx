import React, { useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { UserMenu } from '~/components/shared/UserMenu'

export interface CampaignHeaderProps {
  campaignId?: string
  sessionNumber?: number
  activeTab: 'dashboard' | 'tabletop'
  onTabChange: (tab: 'dashboard' | 'tabletop') => void
}

const TABS = [
  { id: 'dashboard' as const, label: 'Dashboard' },
  { id: 'tabletop' as const, label: 'Tabletop' },
]

export function CampaignHeader({ sessionNumber, activeTab, onTabChange }: CampaignHeaderProps) {
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
    <nav className="flex items-center h-14 px-4 bg-[#0D1117] border-b border-white/[0.07] sticky top-0 z-50 gap-4">
      {/* Left: Back link */}
      <Link
        to="/campaigns"
        className="font-pixel text-xs text-slate-400 hover:text-white transition-colors whitespace-nowrap"
        aria-label="Back to campaigns"
      >
        ← Back
      </Link>

      {/* Left-center: Session number */}
      {sessionNumber !== undefined && (
        <span className="font-pixel text-xs text-slate-300 whitespace-nowrap" data-testid="session-number">
          Session {sessionNumber}
        </span>
      )}

      {/* Center: Tab bar */}
      <div
        className="flex-1 flex items-center justify-center gap-1"
        role="tablist"
        aria-label="MainView navigation"
        ref={tablistRef}
        onKeyDown={handleKeyDown}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onTabChange(tab.id)}
              className={`font-pixel text-xs px-4 h-14 border-b-2 transition-colors ${
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

      {/* Right: Bell + user profile */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Notifications"
          className="text-slate-400 hover:text-slate-200 transition-colors text-base"
        >
          🔔
        </button>

        <UserMenu />
      </div>
    </nav>
  )
}
