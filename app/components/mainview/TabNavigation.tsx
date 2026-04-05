import React, { useRef } from 'react';

export type TabId = 'dashboard' | 'tabletop' | 'gmscreens';

export interface TabNavigationProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  /** When provided, only these tabs are rendered. Defaults to all TABS. */
  visibleTabs?: ReadonlyArray<{ id: TabId; label: string }>;
  className?: string;
}

export const TABS: ReadonlyArray<{ id: TabId; label: string; gmOnly?: boolean }> = [
  { id: 'dashboard' as const, label: 'Dashboard' },
  { id: 'tabletop' as const, label: 'Tabletop' },
  { id: 'gmscreens' as const, label: 'GM Screens', gmOnly: true },
];

export function handleTabsKeyDown(
  e: React.KeyboardEvent,
  activeTab: TabId,
  onTabChange: (tab: TabId) => void,
  tablistRef: React.RefObject<HTMLDivElement | null>,
  tabs: ReadonlyArray<{ id: TabId; label: string }> = TABS
) {
  if (tabs.length === 0) return;

  const focused = e.target as HTMLElement;
  const buttons = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  const currentIndex = buttons
    ? Array.from(buttons).indexOf(focused as HTMLButtonElement)
    : tabs.findIndex((t) => t.id === activeTab);
  if (currentIndex < 0) return;

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

  onTabChange(tabs[nextIndex]!.id);
  buttons?.[nextIndex]?.focus();
}

export function TabNavigation({
  activeTab,
  onTabChange,
  visibleTabs,
  className = '',
}: TabNavigationProps) {
  const tablistRef = useRef<HTMLDivElement>(null);
  const tabs = visibleTabs ?? TABS;

  // Fall back to first visible tab when activeTab is not in the visible set
  const effectiveActiveTab = tabs.some((t) => t.id === activeTab)
    ? activeTab
    : (tabs[0]?.id ?? 'dashboard');

  return (
    <div
      className={`flex items-center h-10 px-4 bg-[#080A12] border-b border-white/[0.07] ${className}`}
    >
      {/* TODO: a11y — add tabIndex and keyboard focus support to tablist */}
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus */}
      <div
        role="tablist"
        aria-label="View navigation"
        ref={tablistRef}
        onKeyDown={(e) => handleTabsKeyDown(e, effectiveActiveTab, onTabChange, tablistRef, tabs)}
        className="flex items-center gap-1"
      >
        {tabs.map((tab) => {
          const isActive = effectiveActiveTab === tab.id;
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
          );
        })}
      </div>
    </div>
  );
}
