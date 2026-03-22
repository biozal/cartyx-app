import React from 'react'
import { createFileRoute, redirect, useNavigate, Link } from '@tanstack/react-router'
import { useState, useRef } from 'react'
import { getMe } from '~/server/functions/auth'
import { getCampaign } from '~/server/functions/campaigns'
import { useUpdateCampaign } from '~/hooks/useCampaigns'
import { Topbar } from '~/components/Topbar'
import { TIMEZONES } from '~/constants/timezones'

export const Route = createFileRoute('/campaigns/$campaignId/edit')({
  beforeLoad: async ({ params }) => {
    const user = await getMe()
    if (!user) throw redirect({ to: '/', search: { reason: 'session_expired' } })
    const campaign = await getCampaign({ data: { id: params.campaignId } })
    if (!campaign) throw redirect({ to: '/campaigns' })
    if (!campaign.isOwner) throw redirect({ to: '/campaigns' })
    return { user, campaign }
  },
  component: EditCampaignPage,
})

function EditCampaignPage() {
  const { campaign } = Route.useRouteContext()
  const navigate = useNavigate()
  const { update, isLoading, error: submitError } = useUpdateCampaign()

  const [name, setName] = useState(campaign.name)
  const [desc, setDesc] = useState(campaign.description)
  const [schedFreq, setSchedFreq] = useState(campaign.schedule.frequency ?? '')
  const [schedDay, setSchedDay] = useState(campaign.schedule.dayOfWeek ?? '')
  const [schedTime, setSchedTime] = useState(campaign.schedule.time ?? '')
  const [schedTz, setSchedTz] = useState(campaign.schedule.timezone ?? 'America/New_York')
  const [callUrl, setCallUrl] = useState(campaign.callUrl ?? '')
  const [dndUrl, setDndUrl] = useState(campaign.dndBeyondUrl ?? '')
  const [maxPlayers, setMaxPlayers] = useState(campaign.maxPlayers)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(campaign.imagePath)
  const fileRef = useRef<HTMLInputElement>(null)

  const [imageError, setImageError] = useState('')
  const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setImageError('Only PNG, JPEG, GIF, and WebP images are allowed')
      return
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setImageError('Image must be under 5MB')
      return
    }
    setImageError('')
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = ev => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function handleSubmit() {
    const result = await update(campaign.id, {
      name, description: desc,
      schedFreq, schedDay, schedTime, schedTz,
      callUrl, dndBeyondUrl: dndUrl,
      maxPlayers,
      imageFile,
    })
    if (result) {
      navigate({ to: '/campaigns/$campaignId/summary', params: { campaignId: campaign.id } })
    }
  }

  const inputCls = "w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.06] transition-all"
  const sectionCls = "bg-[#0D1117] border border-white/[0.07] rounded-2xl p-7 mb-5 shadow-lg"
  const headingCls = "font-pixel text-[8px] text-blue-500 tracking-widest uppercase mb-5"
  const labelCls = "block text-xs font-semibold text-slate-400 mb-2 tracking-wide uppercase"

  return (
    <div className="min-h-screen flex flex-col bg-[#080A12]">
      <Topbar />
      <main className="flex-1 w-full max-w-[760px] mx-auto px-8 py-12">
        <Link to="/campaigns" className="inline-flex items-center gap-1.5 text-slate-500 text-sm hover:text-slate-400 transition-colors mb-8">
          ← Back to Campaigns
        </Link>
        <h1 className="font-pixel text-[13px] text-white tracking-widest mb-9">EDIT CAMPAIGN</h1>

        {submitError && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {submitError}
          </div>
        )}

        <div className={sectionCls}>
          <div className={headingCls}>Basic Info</div>
          <div className="mb-5">
            <label className={labelCls}>Campaign Name *</label>
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="The Lost Mines of Phandelver" />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea className={`${inputCls} resize-y min-h-[100px]`} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Tell your players what awaits them..." />
          </div>
        </div>

        <div className={sectionCls}>
          <div className={headingCls}>Banner Image</div>
          {imageError && (
            <div className="mb-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {imageError}
            </div>
          )}
          <div
            className="border-2 border-dashed border-white/10 rounded-xl p-7 text-center cursor-pointer hover:border-blue-500/40 hover:bg-blue-600/[0.04] transition-all relative overflow-hidden"
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="absolute inset-0 opacity-0 cursor-pointer w-full" onChange={handleImageChange} />
            {imagePreview ? (
              <img src={imagePreview} className="max-w-full max-h-44 rounded-xl object-cover mx-auto" alt="Banner" />
            ) : (
              <>
                <div className="text-3xl mb-2">🖼️</div>
                <div className="text-sm text-slate-500">Drop an image here or <span className="text-blue-400">browse</span></div>
                <div className="text-xs text-slate-700 mt-1">PNG, JPG, WEBP · max 5MB</div>
              </>
            )}
          </div>
        </div>

        <div className={sectionCls}>
          <div className={headingCls}>Schedule</div>
          <div className="mb-5">
            <label className={labelCls}>Frequency</label>
            <div className="flex flex-wrap gap-2">
              {[['weekly','Weekly'],['biweekly','Bi-weekly'],['monthly','Monthly']].map(([val, lbl]) => (
                <button key={val} type="button" onClick={() => setSchedFreq(val)}
                  className={`px-4 py-2 rounded-lg border text-sm font-semibold cursor-pointer transition-all ${schedFreq === val ? 'bg-blue-600/15 border-blue-500 text-blue-400' : 'bg-white/[0.04] border-white/10 text-slate-500 hover:border-blue-500/30 hover:text-slate-400'}`}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-5">
            <label className={labelCls}>Day of Week</label>
            <div className="flex flex-wrap gap-2">
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                <button key={d} type="button" onClick={() => setSchedDay(d)}
                  className={`px-3 py-2 rounded-lg border text-sm font-semibold cursor-pointer transition-all ${schedDay === d ? 'bg-blue-600/15 border-blue-500 text-blue-400' : 'bg-white/[0.04] border-white/10 text-slate-500 hover:border-blue-500/30 hover:text-slate-400'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Time</label>
              <input type="time" className={inputCls} value={schedTime} onChange={e => setSchedTime(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Timezone</label>
              <select className={`${inputCls} cursor-pointer appearance-none`} value={schedTz} onChange={e => setSchedTz(e.target.value)}>
                {TIMEZONES.map(([val, lbl]) => <option key={val} value={val} className="bg-[#0D1117]">{lbl}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className={sectionCls}>
          <div className={headingCls}>Links</div>
          <div className="mb-5">
            <label className={labelCls}>Communication URL</label>
            <input className={inputCls} value={callUrl} onChange={e => setCallUrl(e.target.value)} placeholder="Discord invite or Zoom link" />
          </div>
          <div>
            <label className={labelCls}>D&amp;D Beyond URL</label>
            <input className={inputCls} value={dndUrl} onChange={e => setDndUrl(e.target.value)} placeholder="D&D Beyond campaign link" />
          </div>
        </div>

        <div className={sectionCls}>
          <div className={headingCls}>Players</div>
          <label className={labelCls}>Max Players</label>
          <div className="flex flex-wrap gap-2">
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <button key={n} type="button" onClick={() => setMaxPlayers(n)}
                className={`w-11 h-11 rounded-xl border text-sm font-bold transition-all ${maxPlayers === n ? 'bg-blue-600/20 border-blue-500/70 text-blue-300' : 'bg-white/[0.04] border-white/10 text-slate-500 hover:border-blue-500/30 hover:text-slate-400'}`}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isLoading}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-800 to-blue-600 text-white font-bold text-[15px] hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-blue-600/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none mt-2"
        >
          {isLoading ? 'Saving…' : 'Save Changes'}
        </button>
      </main>
    </div>
  )
}
