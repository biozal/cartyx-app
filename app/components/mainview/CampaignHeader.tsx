import { useState, useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { useAuth } from '~/hooks/useAuth'

export interface CampaignHeaderProps {
  campaignId: string
  sessionNumber?: number
  activeTab: 'dashboard' | 'tabletop'
  onTabChange: (tab: 'dashboard' | 'tabletop') => void
}

const TABS = [
  { id: 'dashboard' as const, label: 'Dashboard' },
  { id: 'tabletop' as const, label: 'Tabletop' },
]

export function CampaignHeader({ campaignId: _campaignId, sessionNumber, activeTab, onTabChange }: CampaignHeaderProps) {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
      <div className="flex-1 flex items-center justify-center gap-1" role="tablist">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
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

        {user && (
          <div className="flex items-center gap-3" ref={menuRef}>
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={`${user.name ?? 'User'} avatar`}
                className="w-8 h-8 rounded-full border-2 border-white/20 object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full border-2 border-white/20 bg-blue-900/40 flex items-center justify-center text-sm">
                🧙
              </div>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen(v => !v)}
                aria-expanded={menuOpen}
                className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition-colors"
              >
                <span className="max-w-[140px] truncate">{user.name ?? ''}</span>
                <span className="text-[10px] text-slate-500">▼</span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-44 bg-[#0D1117] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                  <Link
                    to="/dashboard"
                    className="flex items-center gap-2 px-4 py-3 text-sm text-slate-300 hover:bg-white/[0.04] hover:text-white transition-colors"
                    onClick={() => setMenuOpen(false)}
                  >
                    ⚙️ Dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); logout() }}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:bg-white/[0.04] transition-colors"
                  >
                    🚪 Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
