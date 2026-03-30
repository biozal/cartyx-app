import { Link } from '@tanstack/react-router'
import { useAuth } from '~/hooks/useAuth'
import { UserMenu } from '~/components/shared/UserMenu'

export function Topbar() {
  const { user } = useAuth()

  if (!user) return null

  return (
    <nav className="flex items-center justify-between h-14 px-8 bg-[#0D1117] border-b border-white/[0.07] sticky top-0 z-50">
      <Link
        to="/campaigns"
        className="font-sans font-semibold text-xs text-white tracking-widest hover:text-blue-400 transition-colors"
      >
        CARTYX
      </Link>

      <UserMenu />
    </nav>
  )
}
