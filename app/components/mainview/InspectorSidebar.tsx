import React, { useState, useRef, useEffect, useMemo } from 'react'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { ChatPanel } from './ChatPanel'
import { NotepadPanel } from './NotepadPanel'
import { SettingsPanel } from './SettingsPanel'
import { WikiPanel } from './WikiPanel'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMessage, faBook, faNoteSticky, faGear } from '@fortawesome/pro-solid-svg-icons'
import { ChevronRight } from 'lucide-react'
import { useOptionalFeatureFlagEnabled } from '~/utils/featureFlags'

export type InspectorTab = 'chat' | 'wiki' | 'notepad' | 'settings'

export interface InspectorSidebarProps {
  defaultTab?: InspectorTab
  onMobileClose?: () => void
}

const ALL_TABS: { id: InspectorTab; icon: IconDefinition; label: string }[] = [
  { id: 'chat', icon: faMessage, label: 'Chat' },
  { id: 'wiki', icon: faBook, label: 'Wiki' },
  { id: 'notepad', icon: faNoteSticky, label: 'Notepad' },
  { id: 'settings', icon: faGear, label: 'Settings' },
]

function tabId(id: InspectorTab) {
  return `inspector-tab-${id}`
}

function panelId(id: InspectorTab) {
  return `inspector-panel-${id}`
}

export function InspectorSidebar({ defaultTab = 'chat', onMobileClose }: InspectorSidebarProps) {
  const chatFlagName = import.meta.env.VITE_PUBLIC_FF_CHAT ?? ''
  const notepadFlagName = import.meta.env.VITE_PUBLIC_FF_NOTEPAD ?? ''
  const settingsFlagName = import.meta.env.VITE_PUBLIC_FF_SETTINGS ?? ''

  const chatEnabled = useOptionalFeatureFlagEnabled(chatFlagName)
  const notepadEnabled = useOptionalFeatureFlagEnabled(notepadFlagName)
  const settingsEnabled = useOptionalFeatureFlagEnabled(settingsFlagName)

  const tabs = useMemo(() => ALL_TABS.filter(tab => {
    if (tab.id === 'chat') return chatEnabled
    if (tab.id === 'notepad') return notepadEnabled
    if (tab.id === 'settings') return settingsEnabled
    return true // wiki is always visible
  }), [chatEnabled, notepadEnabled, settingsEnabled])

  const initialTab = tabs.some(t => t.id === defaultTab) ? defaultTab : 'wiki'
  const [activeTab, setActiveTab] = useState<InspectorTab>(initialTab)
  const tablistRef = useRef<HTMLDivElement>(null)

  // If the active tab becomes hidden (flag toggled off), fall back to wiki
  useEffect(() => {
    if (!tabs.some(t => t.id === activeTab)) {
      setActiveTab('wiki')
    }
  }, [tabs, activeTab])

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
      <div className="flex h-12 border-b border-white/[0.07] flex-shrink-0">
        <div
          className="flex flex-1"
          role="tablist"
          aria-label="Inspector panels"
          ref={tablistRef}
          onKeyDown={handleKeyDown}
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab
            return (
              <button
                key={tab.id}
                id={tabId(tab.id)}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={panelId(tab.id)}
                aria-label={tab.label}
                tabIndex={isActive ? 0 : -1}
                data-testid={tabId(tab.id)}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'flex flex-1 items-center justify-center text-base transition-colors relative',
                  isActive
                    ? "text-[#60A5FA] after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#60A5FA]"
                    : 'text-slate-500 hover:text-slate-300',
                ].join(' ')}
              >
                <FontAwesomeIcon icon={tab.icon} className="h-4 w-4" />
              </button>
            )
          })}
        </div>

        {onMobileClose && (
          <button
            type="button"
            aria-label="Close inspector"
            data-testid="mobile-inspector-close"
            onClick={onMobileClose}
            className="lg:hidden flex items-center justify-center w-10 text-slate-400 hover:text-slate-200 border-l border-white/[0.07] transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        )}
      </div>

      {/* Tab panels — one per tab, only active is visible */}
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab
        return (
          <div
            key={tab.id}
            id={panelId(tab.id)}
            data-testid={isActive ? 'inspector-panel' : undefined}
            role="tabpanel"
            aria-labelledby={tabId(tab.id)}
            hidden={!isActive}
            className="flex flex-1"
          >
            {tab.id === 'chat' ? (
              <ChatPanel />
            ) : tab.id === 'wiki' ? (
              <WikiPanel />
            ) : tab.id === 'notepad' ? (
              <NotepadPanel />
            ) : tab.id === 'settings' ? (
              <SettingsPanel />
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <span className="font-pixel text-xs text-slate-600">
                  {tab.label} — Coming Soon
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
