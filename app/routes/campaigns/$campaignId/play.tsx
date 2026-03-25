import { z } from 'zod'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { getMe } from '~/server/functions/auth'
import { CampaignHeader } from '~/components/mainview/CampaignHeader'
import { DashboardView } from '~/components/mainview/DashboardView'
import { MainView } from '~/components/mainview/MainView'
import { TabletopView } from '~/components/mainview/TabletopView'
import type { TabId } from '~/components/mainview/TabNavigation'
import { CatchUpWidget } from '~/components/mainview/widgets/CatchUpWidget'
import { CampaignTimelineWidget } from '~/components/mainview/widgets/CampaignTimelineWidget'
import { KeyAlliesWidget } from '~/components/mainview/widgets/KeyAlliesWidget'
import { PartyMembersWidget } from '~/components/mainview/widgets/PartyMembersWidget'
import { SessionsListWidget } from '~/components/mainview/widgets/SessionsListWidget'
import { getSessions } from '~/services/mocks/sessionsService'

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
  const dashboardWidgets = [
    {
      id: 'catch-up',
      title: 'Catch Up',
      className: 'lg:col-span-2',
      content: <CatchUpWidget />,
    },
    {
      id: 'party-members',
      title: 'Party Members',
      content: <PartyMembersWidget />,
    },
    {
      id: 'key-allies',
      title: 'Key Allies',
      content: <KeyAlliesWidget />,
    },
    {
      id: 'sessions',
      title: 'Sessions',
      className: 'xl:col-span-2',
      content: <SessionsListWidget sessions={getSessions()} />,
    },
    {
      id: 'campaign-timeline',
      title: 'Campaign Timeline',
      className: 'xl:col-span-2',
      content: <CampaignTimelineWidget />,
    },
  ]

  function handleTabChange(tab: TabId) {
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, tab }) })
  }

  return (
    <div className="flex flex-col h-screen bg-[#080A12]">
      <CampaignHeader activeTab={activeTab} onTabChange={handleTabChange} />
      <div className="flex-1 overflow-hidden">
        <MainView showToolbar={activeTab === 'tabletop'}>
          <div
            className="h-full overflow-y-auto"
            role="tabpanel"
            id="tab-panel-dashboard"
            aria-labelledby="tab-dashboard"
            hidden={activeTab !== 'dashboard'}
          >
            <DashboardView className="h-full" widgets={dashboardWidgets} />
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
