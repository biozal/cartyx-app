import React, { useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGear } from '@fortawesome/pro-solid-svg-icons'
import { UserMenu } from '~/components/shared/UserMenu'
import { TABS, handleTabsKeyDown } from './TabNavigation'
import type { TabId } from './TabNavigation'

export interface CampaignHeaderProps {
  campaignId?: string
  sessionNumber?: number
  isOwner?: boolean
  activeSessionName?: string
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

export function CampaignHeader({ campaignId, sessionNumber, isOwner, activeSessionName, activeTab, onTabChange }: CampaignHeaderProps) {
  const tablistRef = useRef<HTMLDivElement>(null)
  const visibleTabs = TABS.filter(tab => !tab.gmOnly || isOwner)

  return (
    <nav className="flex items-center h-14 px-4 bg-[#0D1117] border-b border-white/[0.07] sticky top-0 z-50 gap-4">
      <span className="font-sans font-semibold text-xs text-white tracking-widest whitespace-nowrap">
        CARTYX
      </span>

      {/* Left-center: Active session name + gear (GM only) */}
      {isOwner && campaignId && (
        <div className="flex items-center gap-2">
          <span
            className={`font-sans text-xs font-semibold whitespace-nowrap ${
              activeSessionName ? 'text-[#2563EB]' : 'text-slate-500'
            }`}
            data-testid="active-session-name"
          >
            {activeSessionName ?? 'No Session'}
          </span>
          <Link
            to="/campaigns/$campaignId/sessions"
            params={{ campaignId }}
            aria-label="Manage sessions"
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <FontAwesomeIcon icon={faGear} className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* Left-center: Session number (fallback when session info not shown) */}
      {!(isOwner && campaignId) && sessionNumber !== undefined && (
        <span className="font-sans font-semibold text-xs text-slate-300 whitespace-nowrap" data-testid="session-number">
          Session {sessionNumber}
        </span>
      )}

      {/* Center: Tab bar */}
      <div
        className="flex-1 flex items-center justify-center gap-1"
        role="tablist"
        aria-label="MainView navigation"
        ref={tablistRef}
        onKeyDown={(e) => handleTabsKeyDown(e, activeTab, onTabChange, tablistRef, visibleTabs)}
      >
        {visibleTabs.map((tab) => {
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
              className={`font-sans font-semibold text-xs px-4 h-14 border-b-2 transition-colors ${
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

        <UserMenu contextualAction={{ label: 'Close Campaign', to: '/campaigns' }} />
      </div>
    </nav>
  )
}
