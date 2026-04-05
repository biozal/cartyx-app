import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { ChatPanel } from './ChatPanel';
import { NotesPanel } from './NotesPanel';
import { SettingsPanel } from './SettingsPanel';
import { WikiPanel } from '~/components/wiki/WikiPanel';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMessage, faBook, faNoteSticky, faGear } from '@fortawesome/pro-solid-svg-icons';
import { ChevronRight } from 'lucide-react';
import { useOptionalFeatureFlag } from '~/utils/featureFlags';

export type InspectorTab = 'chat' | 'wiki' | 'notes' | 'settings';

export interface InspectorSidebarProps {
  defaultTab?: InspectorTab;
  onMobileClose?: () => void;
}

const ALL_TABS: { id: InspectorTab; icon: IconDefinition; label: string }[] = [
  { id: 'chat', icon: faMessage, label: 'Chat' },
  { id: 'wiki', icon: faBook, label: 'Wiki' },
  { id: 'notes', icon: faNoteSticky, label: 'Notes' },
  { id: 'settings', icon: faGear, label: 'Settings' },
];

function tabId(id: InspectorTab) {
  return `inspector-tab-${id}`;
}

function panelId(id: InspectorTab) {
  return `inspector-panel-${id}`;
}

export function InspectorSidebar({ defaultTab = 'chat', onMobileClose }: InspectorSidebarProps) {
  const chatFlagName = import.meta.env.VITE_PUBLIC_FF_CHAT ?? '';
  const wikiFlagName = import.meta.env.VITE_PUBLIC_FF_WIKI ?? '';
  const notesFlagName = import.meta.env.VITE_PUBLIC_FF_NOTES ?? '';
  const settingsFlagName = import.meta.env.VITE_PUBLIC_FF_SETTINGS ?? '';

  const chatFlag = useOptionalFeatureFlag(chatFlagName);
  const wikiFlag = useOptionalFeatureFlag(wikiFlagName);
  const notesFlag = useOptionalFeatureFlag(notesFlagName);
  const settingsFlag = useOptionalFeatureFlag(settingsFlagName);

  const tabs = useMemo(
    () =>
      ALL_TABS.filter((tab) => {
        if (tab.id === 'chat') return chatFlag.isEnabled;
        if (tab.id === 'wiki') return wikiFlag.isEnabled;
        if (tab.id === 'notes') return notesFlag.isEnabled;
        if (tab.id === 'settings') return settingsFlag.isEnabled;
        return true;
      }),
    [chatFlag.isEnabled, wikiFlag.isEnabled, notesFlag.isEnabled, settingsFlag.isEnabled]
  );

  const isLoading =
    chatFlag.isLoading || wikiFlag.isLoading || notesFlag.isLoading || settingsFlag.isLoading;

  const initialTab = tabs.some((t) => t.id === defaultTab) ? defaultTab : (tabs[0]?.id ?? 'chat');
  const [activeTab, setActiveTab] = useState<InspectorTab>(initialTab);
  const hasInteracted = useRef(false);
  const tablistRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tabs.some((t) => t.id === activeTab)) {
      // Active tab became unavailable (flag disabled) — fall back to first available
      setActiveTab(tabs[0]?.id ?? 'chat');
    } else if (
      !hasInteracted.current &&
      activeTab !== defaultTab &&
      tabs.some((t) => t.id === defaultTab)
    ) {
      // Flags finished loading and defaultTab is now available; restore it
      // only if the user has not manually navigated away
      setActiveTab(defaultTab);
    }
  }, [tabs, activeTab, defaultTab]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (tabs.length === 0) return;

    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    let nextIndex = currentIndex;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    hasInteracted.current = true;
    setActiveTab(tabs[nextIndex]!.id);
    const buttons = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[nextIndex]?.focus();
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#0D1117]">
      {/* Tab bar */}
      <div className="flex h-12 border-b border-white/[0.07] flex-shrink-0">
        {/* TODO: a11y — add tabIndex and keyboard focus support to tablist */}
        {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus */}
        <div
          className="flex flex-1"
          role="tablist"
          aria-label="Inspector panels"
          ref={tablistRef}
          onKeyDown={handleKeyDown}
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
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
                onClick={() => {
                  hasInteracted.current = true;
                  setActiveTab(tab.id);
                }}
                className={[
                  'flex flex-1 items-center justify-center text-base transition-colors relative',
                  isActive
                    ? "text-[#60A5FA] after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#60A5FA]"
                    : 'text-slate-500 hover:text-slate-300',
                ].join(' ')}
              >
                <FontAwesomeIcon icon={tab.icon} className="h-4 w-4" />
              </button>
            );
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
      {isLoading && tabs.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="font-sans font-semibold text-xs text-slate-500">Loading panels...</p>
        </div>
      ) : tabs.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="font-sans font-semibold text-xs text-slate-500">No panels available</p>
        </div>
      ) : (
        tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <div
              key={tab.id}
              id={panelId(tab.id)}
              data-testid={isActive ? 'inspector-panel' : undefined}
              role="tabpanel"
              aria-labelledby={tabId(tab.id)}
              hidden={!isActive}
              className="flex flex-1 w-full"
            >
              {tab.id === 'chat' ? (
                <ChatPanel />
              ) : tab.id === 'wiki' ? (
                <WikiPanel />
              ) : tab.id === 'notes' ? (
                <NotesPanel />
              ) : tab.id === 'settings' ? (
                <SettingsPanel />
              ) : (
                <div className="flex flex-1 items-center justify-center">
                  <span className="font-sans font-semibold text-xs text-slate-600">
                    {tab.label} — Coming Soon
                  </span>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
