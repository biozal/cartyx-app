import { useState, type FormEvent } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { getMe } from '~/server/functions/auth'
import { listCampaigns } from '~/server/functions/campaigns'
import { Topbar } from '~/components/Topbar'
import { Toast, showToast } from '~/components/Toast'
import { PixelButton } from '~/components/PixelButton'
import { useJoinCampaign } from '~/hooks/useCampaigns'
import { formatNextSession } from '~/utils/date'
import type { CampaignData } from '~/server/functions/campaigns'
import { captureEvent } from '~/utils/posthog-client'

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
      // Track that a clipboard copy was attempted
      captureEvent('invite_code_copy_attempted', { campaign_id: campaign.id })

      navigator.clipboard
        .writeText(code)
        .then(() => {
          // Only mark as succeeded after the write completes
          captureEvent('invite_code_copy_succeeded', { campaign_id: campaign.id })
          showToast(`✓ Invite code copied: ${code}`)
        })
        .catch((error) => {
          // Track failure and fall back to showing the code directly
          captureEvent('invite_code_copy_failed', {
            campaign_id: campaign.id,
            error_message: error instanceof Error ? error.message : String(error),
          })
          showToast(`Code: ${code}`)
        })
    } else {
      // Clipboard API not available; show code and track fallback
      captureEvent('invite_code_copy_fallback_shown', { campaign_id: campaign.id })
      showToast(`Code: ${code}`)
    }
  }

  return (
    <div className="bg-[#0D1117] border border-white/[0.07] rounded-2xl overflow-hidden flex flex-col hover:border-blue-500/25 hover:-translate-y-0.5 hover:shadow-2xl transition-all duration-200">
      {/* Banner */}
      <div
        className="relative h-40 flex items-center justify-center overflow-hidden"
        style={{
          background: campaign.imagePath && (/^\/uploads\/[a-zA-Z0-9/_.-]+$/.test(campaign.imagePath) || /^https:\/\/cdn[-.][\w.]+\/[\w/._-]+$/.test(campaign.imagePath))
            ? `url(${JSON.stringify(campaign.imagePath)}) center/cover no-repeat, ${isActive ? 'linear-gradient(135deg, #0F1729 0%, #0D1B3E 50%, #0A1628 100%)' : 'linear-gradient(135deg, #0F1117 0%, #141820 50%, #0C0E14 100%)'}`
            : isActive
            ? 'linear-gradient(135deg, #0F1729 0%, #0D1B3E 50%, #0A1628 100%)'
            : 'linear-gradient(135deg, #0F1117 0%, #141820 50%, #0C0E14 100%)',
        }}
      >
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 30% 40%, rgba(37,99,235,0.08) 0%, transparent 60%)' }} />
        <span className="text-5xl opacity-35 drop-shadow-lg">{isActive ? '⚔️' : '🏔️'}</span>
        <span
          className="absolute top-3.5 right-3.5 font-pixel text-[9px] tracking-wide px-2.5 py-1 rounded-md font-bold"
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
                ? formatNextSession(
                    campaign.nextSession.day,
                    campaign.schedule.time,
                    campaign.schedule.timezone
                  )
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
            <PixelButton
              variant="secondary"
              size="sm"
              icon="📋"
              onClick={copyInviteCode}
              className="flex-1"
            >
              Copy Code
            </PixelButton>
            <PixelButton
              as="link"
              variant="warning"
              size="sm"
              icon="✏️"
              to="/campaigns/$campaignId/edit"
              params={{ campaignId: campaign.id }}
              className="flex-1"
            >
              Edit Camp
            </PixelButton>
          </div>
        )}

        <PixelButton
          as="link"
          variant="primary"
          size="md"
          to="/campaigns/$campaignId/summary"
          params={{ campaignId: campaign.id }}
          fullWidth
          className="mt-auto"
        >
          Enter Camp
        </PixelButton>
      </div>
    </div>
  )
}

function CampaignsListPage() {
  const { user } = Route.useRouteContext()
  const { campaigns } = Route.useLoaderData()
  const isGm = user.role === 'gm'
  const navigate = useNavigate()
  const [showJoinForm, setShowJoinForm] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const { join, isLoading: isJoining, error: joinError } = useJoinCampaign()

  async function handleJoin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const result = await join(joinCode.trim())
    if (result) {
      navigate({ to: '/campaigns/$campaignId/summary', params: { campaignId: result.campaignId } })
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#080A12]">
      <Topbar />
      <main className="flex-1 w-full max-w-[1160px] mx-auto px-8 py-12">
        <div className="flex items-center justify-between mb-10">
          <h1 className="font-pixel text-[15px] text-white tracking-widest">MY CAMPAIGNS</h1>
          <div className="flex gap-3">
            {!isGm && (
              <PixelButton
                variant="primary"
                size="md"
                icon="🗝️"
                onClick={() => setShowJoinForm(true)}
              >
                Join Campaign
              </PixelButton>
            )}
            {isGm && (
              <PixelButton
                as="link"
                variant="primary"
                size="md"
                icon="⚔️"
                to="/campaigns/new"
              >
                Create Campaign
              </PixelButton>
            )}
          </div>
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
            {isGm ? (
              <PixelButton
                as="link"
                variant="primary"
                size="lg"
                icon="⚔️"
                to="/campaigns/new"
              >
                Create Campaign
              </PixelButton>
            ) : (
              <PixelButton
                variant="primary"
                size="lg"
                icon="🗝️"
                onClick={() => setShowJoinForm(true)}
              >
                Join Campaign
              </PixelButton>
            )}
          </div>
        )}
      </main>
      <Toast />

      {showJoinForm && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="join-campaign-title"
          onKeyDown={e => { if (e.key === 'Escape') { setShowJoinForm(false); setJoinCode('') } }}
          onClick={e => { if (e.target === e.currentTarget) { setShowJoinForm(false); setJoinCode('') } }}
        >
          <div className="bg-[#0D1117] border border-white/[0.07] rounded-2xl p-8 w-full max-w-md mx-4">
            <h2 id="join-campaign-title" className="font-pixel text-[11px] text-white tracking-widest mb-6">JOIN CAMPAIGN</h2>
            <form onSubmit={handleJoin} className="space-y-4">
              <input
                type="text"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
                placeholder="Enter invite code (e.g. ABCD-EFGH)"
                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.1] text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500/40"
                disabled={isJoining}
                autoFocus
                aria-label="Invite code"
              />
              {joinError && <p className="text-red-400 text-xs" role="alert">{joinError}</p>}
              <div className="flex gap-3">
                <PixelButton
                  variant="secondary"
                  size="md"
                  onClick={() => { setShowJoinForm(false); setJoinCode('') }}
                  disabled={isJoining}
                  className="flex-1"
                  type="button"
                >
                  Cancel
                </PixelButton>
                <PixelButton
                  variant="primary"
                  size="md"
                  type="submit"
                  disabled={isJoining || !joinCode.trim()}
                  className="flex-1"
                >
                  {isJoining ? 'Joining...' : 'Join Campaign'}
                </PixelButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
