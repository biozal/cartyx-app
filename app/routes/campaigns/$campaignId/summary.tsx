import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { getMe } from '~/server/functions/auth'
import { getCampaign } from '~/server/functions/campaigns'
import { Topbar } from '~/components/Topbar'
import { Toast, showToast } from '~/components/Toast'

export const Route = createFileRoute('/campaigns/$campaignId/summary')({
  beforeLoad: async () => {
    const user = await getMe()
    if (!user) throw redirect({ to: '/', search: { reason: 'session_expired' } })
    return { user }
  },
  loader: async ({ params }) => {
    const campaign = await getCampaign({ data: { id: params.campaignId } })
    if (!campaign) throw redirect({ to: '/campaigns' })
    return { campaign }
  },
  component: CampaignSummaryPage,
})

function CampaignSummaryPage() {
  const { campaign } = Route.useLoaderData()

  function copyCode() {
    const code = campaign.inviteCode
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(() => showToast(`✓ Invite code copied: ${code}`))
    } else {
      showToast(`Code: ${code}`)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#080A12]">
      <Topbar />
      <main className="flex-1 w-full max-w-[640px] mx-auto px-8 py-12">
        <Link to="/campaigns" className="inline-flex items-center gap-1.5 text-slate-500 text-sm hover:text-slate-400 transition-colors mb-8">
          ← Back to Campaigns
        </Link>

        <div className="bg-[#0D1117] border border-white/[0.07] rounded-2xl p-9 shadow-2xl">
          {campaign.imagePath && (
            <img src={campaign.imagePath} className="w-full max-h-52 object-cover rounded-xl mb-6" alt="" />
          )}

          <div className="font-pixel text-[12px] text-slate-100 leading-relaxed mb-3">{campaign.name}</div>
          {campaign.description && (
            <p className="text-sm text-slate-500 leading-relaxed mb-7">{campaign.description}</p>
          )}

          {/* Invite code — only visible to campaign owner */}
          {campaign.inviteCode ? (
            <div className="text-center px-5 py-7 bg-blue-600/[0.06] border border-blue-500/15 rounded-2xl mb-6">
              <div className="font-pixel text-[7px] text-blue-500 tracking-widest mb-4">INVITE CODE</div>
              <div className="font-pixel text-[22px] text-white tracking-[6px] leading-relaxed mb-5">
                {campaign.inviteCode}
              </div>
              <button
                onClick={copyCode}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-blue-500/30 bg-blue-600/12 text-blue-400 text-sm font-semibold hover:bg-blue-600/20 hover:border-blue-500/50 transition-all"
              >
                📋 Copy Code
              </button>
            </div>
          ) : (
            <div className="text-center px-5 py-5 bg-white/[0.02] border border-white/[0.06] rounded-2xl mb-6">
              <div className="font-pixel text-[7px] text-slate-600 tracking-widest mb-2">INVITE CODE</div>
              <p className="text-xs text-slate-600">Only the campaign owner can view the invite code</p>
            </div>
          )}

          {/* Meta */}
          <div className="space-y-3 mb-7">
            <div className="flex items-center gap-2.5">
              <span className="text-sm w-6 text-center">🗓</span>
              <span className="text-xs text-slate-500 font-medium flex-1">Schedule</span>
              <span className="text-sm text-slate-400 font-medium">{campaign.scheduleText}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-sm w-6 text-center">👥</span>
              <span className="text-xs text-slate-500 font-medium flex-1">Max Players</span>
              <span className="text-sm text-slate-400 font-medium">{campaign.maxPlayers}</span>
            </div>
            {campaign.callUrl && (
              <div className="flex items-center gap-2.5">
                <span className="text-sm w-6 text-center">💬</span>
                <span className="text-xs text-slate-500 font-medium flex-1">Communication</span>
                <a href={campaign.callUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 font-medium hover:text-blue-300">Link</a>
              </div>
            )}
            {campaign.dndBeyondUrl && (
              <div className="flex items-center gap-2.5">
                <span className="text-sm w-6 text-center">📖</span>
                <span className="text-xs text-slate-500 font-medium flex-1">D&amp;D Beyond</span>
                <a href={campaign.dndBeyondUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 font-medium hover:text-blue-300">Link</a>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 flex-wrap">
            <Link
              to="/campaigns"
              className="flex-1 min-w-[140px] flex items-center justify-center py-3.5 rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 text-white font-bold text-sm hover:-translate-y-px hover:shadow-lg hover:shadow-blue-600/30 transition-all"
            >
              View All Campaigns
            </Link>
            {campaign.isOwner && (
              <Link
                to="/campaigns/$campaignId/edit"
                params={{ campaignId: campaign.id }}
                className="flex-1 min-w-[140px] flex items-center justify-center py-3.5 rounded-xl border border-white/10 text-slate-400 font-semibold text-sm hover:bg-white/[0.04] hover:text-slate-200 transition-all"
              >
                Edit Campaign
              </Link>
            )}
          </div>
        </div>
      </main>
      <Toast />
    </div>
  )
}
