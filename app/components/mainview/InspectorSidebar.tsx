import { useState } from 'react'

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

  const activeTabLabel = tabs.find((t) => t.id === activeTab)?.label ?? ''

  return (
    <div className="flex flex-col h-full bg-[#0D1117]">
      {/* Tab bar */}
      <div className="flex h-12 border-b border-white/[0.07] flex-shrink-0">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab
          return (
            <button
              key={tab.id}
              data-testid={`inspector-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              aria-label={tab.label}
              className={[
                'flex flex-1 items-center justify-center text-base transition-colors relative',
                isActive
                  ? 'text-[#60A5FA] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#60A5FA]'
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
        data-testid="inspector-panel"
        className="flex flex-1 items-center justify-center"
      >
        <span className="font-pixel text-xs text-slate-600">
          {activeTabLabel} — Coming Soon
        </span>
      </div>
    </div>
  )
}
