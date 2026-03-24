import { useState, useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { useAuth } from '~/hooks/useAuth'

export function UserMenu() {
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

  if (!user) return null

  return (
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
          aria-label="User menu"
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
  )
}
