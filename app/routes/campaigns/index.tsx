import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { getMe } from '~/server/functions/auth'
import { listCampaigns } from '~/server/functions/campaigns'
import { Topbar } from '~/components/Topbar'
import { Toast, showToast } from '~/components/Toast'
import type { CampaignData } from '~/server/functions/campaigns'

export const Route = createFileRoute('/campaigns/')({
  beforeLoad: async () => {
    const user = await getMe()
    if (!user) throw redirect({ to: '/', search: { reason: 'session_expired' } })
    return { user }
  },
  loader: async () => {
    const campaigns = await listCampaigns()
    return { campaigns }
  },
  component: CampaignsListPage,
})

function CampaignCard({ campaign }: { campaign: CampaignData }) {
  const isActive = campaign.status === 'active'
  const playerPct = Math.round((campaign.players.current / campaign.players.max) * 100)

  function copyInviteCode() {
    const code = campaign.inviteCode
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(() => showToast(`✓ Invite code copied: ${code}`))
    } else {
      showToast(`Code: ${code}`)
    }
  }

  return (
    <div className="bg-[#0D1117] border border-white/[0.07] rounded-2xl overflow-hidden flex flex-col hover:border-blue-500/25 hover:-translate-y-0.5 hover:shadow-2xl transition-all duration-200">
      {/* Banner */}
      <div
        className="relative h-40 flex items-center justify-center overflow-hidden"
        style={{
          background: campaign.imagePath
            ? `url('${campaign.imagePath}') center/cover no-repeat, ${isActive ? 'linear-gradient(135deg, #0F1729 0%, #0D1B3E 50%, #0A1628 100%)' : 'linear-gradient(135deg, #0F1117 0%, #141820 50%, #0C0E14 100%)'}`
            : isActive
            ? 'linear-gradient(135deg, #0F1729 0%, #0D1B3E 50%, #0A1628 100%)'
            : 'linear-gradient(135deg, #0F1117 0%, #141820 50%, #0C0E14 100%)',
        }}
      >
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 30% 40%, rgba(37,99,235,0.08) 0%, transparent 60%)' }} />
        <span className="text-5xl opacity-35 drop-shadow-lg">{isActive ? '⚔️' : '🏔️'}</span>
        <span
          className="absolute top-3.5 right-3.5 font-pixel text-[7px] tracking-wide px-2.5 py-1 rounded-md font-bold"
          style={{ background: isActive ? '#2563EB' : '#334155', color: isActive ? '#fff' : '#CBD5E1' }}
        >
          {isActive ? 'ACTIVE' : 'PAUSED'}
        </span>
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col flex-1">
        <div className="font-pixel text-[11px] text-slate-100 leading-relaxed mb-2.5">{campaign.name}</div>
        <p className="text-sm text-slate-500 leading-relaxed line-clamp-2 mb-4">{campaign.description}</p>

        {/* Meta */}
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">{campaign.nextSession ? '🗓' : '⏸'}</span>
            <span className="text-xs text-slate-500 font-medium flex-1">Next Session</span>
            <span className="text-xs text-slate-400 font-medium">
              {campaign.nextSession
                ? `${campaign.nextSession.day} · ${campaign.nextSession.time}`
                : <span className="text-slate-600">Not scheduled</span>}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">👥</span>
            <span className="text-xs text-slate-500 font-medium flex-1">Players</span>
            <span className="text-xs text-slate-400 font-medium">{campaign.players.current} / {campaign.players.max}</span>
          </div>
          <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden mt-1">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${playerPct}%`,
                background: isActive ? 'linear-gradient(90deg,#1D4ED8,#3B82F6)' : 'linear-gradient(90deg,#334155,#475569)',
              }}
            />
          </div>
        </div>

        {/* Actions */}
        {campaign.isOwner && (
          <div className="flex gap-2 mb-2.5">
            <button
              onClick={copyInviteCode}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-blue-500/20 bg-blue-600/8 text-blue-400 text-xs font-semibold hover:bg-blue-600/15 hover:border-blue-500/40 transition-all"
            >
              📋 Copy Invite Code
            </button>
            <Link
              to="/campaigns/$campaignId/edit"
              params={{ campaignId: campaign.id }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-yellow-500/25 bg-yellow-500/8 text-yellow-400 text-xs font-semibold hover:bg-yellow-500/15 hover:border-yellow-500/40 transition-all"
            >
              ✏️ Edit
            </Link>
          </div>
        )}

        <Link
          to="/campaigns/$campaignId/summary"
          params={{ campaignId: campaign.id }}
          className="mt-auto flex items-center justify-center py-3 rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 text-white text-sm font-bold hover:-translate-y-px hover:shadow-lg hover:shadow-blue-600/30 transition-all"
        >
          Enter Campaign
        </Link>
      </div>
    </div>
  )
}

function CampaignsListPage() {
  const { user } = Route.useRouteContext()
  const { campaigns } = Route.useLoaderData()
  const isGm = user.role === 'gm'

  return (
    <div className="min-h-screen flex flex-col bg-[#080A12]">
      <Topbar />
      <main className="flex-1 w-full max-w-[1160px] mx-auto px-8 py-12">
        <div className="flex items-center justify-between mb-10">
          <h1 className="font-pixel text-[15px] text-white tracking-widest">MY CAMPAIGNS</h1>
          {isGm && (
            <Link
              to="/campaigns/new"
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 text-white text-sm font-semibold hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-600/30 transition-all"
            >
              ⚔️ Create Campaign
            </Link>
          )}
        </div>

        {campaigns.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-6">
            {campaigns.map(c => <CampaignCard key={c.id} campaign={c} />)}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-16">
            <img
              src="/cartyx-rogue.png"
              alt="No campaigns"
              className="w-80 h-auto mb-6 rounded-xl object-contain"
              style={{ imageRendering: 'pixelated', filter: 'sepia(1) hue-rotate(185deg) saturate(2) brightness(0.75)' }}
            />
            <div className="font-pixel text-[11px] text-slate-500 tracking-widest mb-3 leading-relaxed">NO CAMPAIGNS YET</div>
            <p className="text-sm text-slate-600 max-w-sm leading-relaxed mb-8">
              {isGm
                ? 'Create your first campaign to get started.'
                : 'Ask your GM for an invite code to join a campaign.'}
            </p>
            {isGm && (
              <Link
                to="/campaigns/new"
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 text-white text-sm font-semibold hover:shadow-lg hover:shadow-blue-600/30 transition-all"
              >
                ⚔️ Create Campaign
              </Link>
            )}
          </div>
        )}
      </main>
      <Toast />
    </div>
  )
}
