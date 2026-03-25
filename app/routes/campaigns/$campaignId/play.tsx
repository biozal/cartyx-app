import { z } from 'zod'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { getMe } from '~/server/functions/auth'
import { CampaignHeader } from '~/components/mainview/CampaignHeader'
import { MainView } from '~/components/mainview/MainView'
import { TabletopView } from '~/components/mainview/TabletopView'
import type { TabId } from '~/components/mainview/TabNavigation'

export const playSearchSchema = z.object({
  tab: z.enum(['dashboard', 'tabletop']).catch('dashboard'),
})

export const Route = createFileRoute('/campaigns/$campaignId/play')({
  validateSearch: (search: Record<string, unknown>) => playSearchSchema.parse(search),
  beforeLoad: async () => {
    const user = await getMe()
    if (!user) throw redirect({ to: '/', search: { reason: 'session_expired' } })
    return { user }
  },
  component: PlayPage,
})

function PlayPage() {
  const { tab: activeTab } = Route.useSearch()
  const navigate = Route.useNavigate()

  function handleTabChange(tab: TabId) {
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, tab }) })
  }

  return (
    <div className="flex flex-col h-screen bg-[#080A12]">
      <CampaignHeader activeTab={activeTab} onTabChange={handleTabChange} />
      <div className="flex-1 overflow-hidden">
        <MainView showToolbar={activeTab === 'tabletop'}>
          <div
            className="flex items-center justify-center h-full text-slate-400 font-pixel text-xs"
            role="tabpanel"
            id="tab-panel-dashboard"
            aria-labelledby="tab-dashboard"
            hidden={activeTab !== 'dashboard'}
          >
            Dashboard View
          </div>
          <div
            className="flex items-center justify-center h-full text-slate-400 font-pixel text-xs"
            role="tabpanel"
            id="tab-panel-tabletop"
            aria-labelledby="tab-tabletop"
            hidden={activeTab !== 'tabletop'}
          >
            <TabletopView />
          </div>
        </MainView>
      </div>
    </div>
  )
}
