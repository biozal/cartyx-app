import { z } from 'zod'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { getMe } from '~/server/functions/auth'
import { useCampaign } from '~/hooks/useCampaigns'
import { CampaignHeader } from '~/components/mainview/CampaignHeader'
import { DashboardView } from '~/components/mainview/DashboardView'
import { MainView } from '~/components/mainview/MainView'
import { TabletopView } from '~/components/mainview/TabletopView'
import { GMScreensView } from '~/components/mainview/gmscreens'
import type { TabId } from '~/components/mainview/TabNavigation'
import { CatchUpWidget } from '~/components/mainview/widgets/CatchUpWidget'
import { CampaignTimelineWidget } from '~/components/mainview/widgets/CampaignTimelineWidget'
import { KeyAlliesWidget } from '~/components/mainview/widgets/KeyAlliesWidget'
import { PartyMembersWidget } from '~/components/mainview/widgets/PartyMembersWidget'
import { SessionsListWidget } from '~/components/mainview/widgets/SessionsListWidget'

export const playSearchSchema = z.object({
  tab: z.enum(['dashboard', 'tabletop', 'gmscreens']).catch('dashboard'),
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
  const { campaignId } = Route.useParams()
  const navigate = Route.useNavigate()
  const { campaign } = useCampaign(campaignId)

  const activeSession = campaign?.sessions.find(s => s.status === 'active')

  // Coerce non-owners away from the GM-only tab
  const effectiveTab = (activeTab === 'gmscreens' && !campaign?.isGM) ? 'dashboard' as const : activeTab

  function handleTabChange(tab: TabId) {
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, tab }) })
  }

  return (
    <div className="flex flex-col h-screen bg-[#080A12]">
      <CampaignHeader
        campaignId={campaignId}
        isOwner={campaign?.isOwner}
        isGM={campaign?.isGM}
        activeSessionName={activeSession?.name}
        activeTab={effectiveTab}
        onTabChange={handleTabChange}
      />
      <div className="flex-1 overflow-hidden">
        <MainView showToolbar={effectiveTab === 'tabletop'} showInspector={effectiveTab !== 'gmscreens'}>
          <div
            className="h-full overflow-y-auto"
            role="tabpanel"
            id="tab-panel-dashboard"
            aria-labelledby="tab-dashboard"
            hidden={effectiveTab !== 'dashboard'}
          >
            <DashboardView>
              <CatchUpWidget />
              <PartyMembersWidget />
              <KeyAlliesWidget />
              <SessionsListWidget className="col-span-full" />
              <CampaignTimelineWidget className="xl:col-span-2" />
            </DashboardView>
          </div>
          <div
            className="flex items-center justify-center h-full text-slate-400 font-sans font-semibold text-xs"
            role="tabpanel"
            id="tab-panel-tabletop"
            aria-labelledby="tab-tabletop"
            hidden={effectiveTab !== 'tabletop'}
          >
            <TabletopView />
          </div>
          {campaign?.isGM && (
            <div
              className="h-full"
              role="tabpanel"
              id="tab-panel-gmscreens"
              aria-labelledby="tab-gmscreens"
              hidden={effectiveTab !== 'gmscreens'}
            >
              {effectiveTab === 'gmscreens' && (
                <GMScreensView campaignId={campaignId} />
              )}
            </div>
          )}
        </MainView>
      </div>
    </div>
  )
}
