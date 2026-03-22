import React from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState, useRef } from 'react'
import { getMe } from '~/server/functions/auth'
import { useCreateCampaign } from '~/hooks/useCampaigns'
import { Topbar } from '~/components/Topbar'

export const Route = createFileRoute('/campaigns/new')({
  beforeLoad: async () => {
    const user = await getMe()
    if (!user) throw redirect({ to: '/', search: { reason: 'session_expired' } })
    if (user.role !== 'gm') throw redirect({ to: '/campaigns' })
    return { user }
  },
  component: NewCampaignPage,
})

const STEPS = ['THE QUEST', 'THE SCHEDULE', 'THE GATHERING', 'THE ROSTER', 'REVIEW']
const TIMEZONES = [
  ['America/New_York', 'ET (New York)'],
  ['America/Chicago', 'CT (Chicago)'],
  ['America/Denver', 'MT (Denver)'],
  ['America/Los_Angeles', 'PT (Los Angeles)'],
  ['America/Anchorage', 'AKT (Anchorage)'],
  ['Pacific/Honolulu', 'HST (Honolulu)'],
  ['Europe/London', 'GMT (London)'],
  ['Europe/Paris', 'CET (Paris)'],
  ['Europe/Berlin', 'CET (Berlin)'],
  ['Asia/Tokyo', 'JST (Tokyo)'],
  ['Australia/Sydney', 'AEST (Sydney)'],
  ['UTC', 'UTC'],
]

function NewCampaignPage() {
  const navigate = useNavigate()
  const { create, isLoading, error: submitError } = useCreateCampaign()

  const [step, setStep] = useState(1)
  const [stepError, setStepError] = useState('')

  // Form state
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [schedFreq, setSchedFreq] = useState('weekly')
  const [schedDay, setSchedDay] = useState('Sat')
  const [schedTime, setSchedTime] = useState('19:00')
  const [schedTz, setSchedTz] = useState('America/Chicago')
  const [callUrl, setCallUrl] = useState('')
  const [dndUrl, setDndUrl] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setStepError('Image must be under 5MB'); return }
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = ev => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  function validateStep(n: number): boolean {
    setStepError('')
    if (n === 1) {
      if (!name.trim()) { setStepError('Campaign name is required.'); return false }
    }
    return true
  }

  function goTo(n: number) {
    if (n > step && !validateStep(step)) return
    setStepError('')
    setStep(n)
  }

  async function handleSubmit() {
    const result = await create({
      name, description: desc,
      schedFreq, schedDay, schedTime, schedTz,
      callUrl, dndBeyondUrl: dndUrl,
      maxPlayers,
      imageFile,
    })
    if (result) navigate({ to: '/campaigns/$campaignId/summary', params: { campaignId: result.campaignId } })
  }

  const freqMap: Record<string, string> = { weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly' }
  const descShort = desc.length > 80 ? desc.slice(0, 80) + '...' : desc

  return (
    <div className="min-h-screen flex flex-col bg-[#080A12]">
      <Topbar />
      <main className="flex-1 w-full max-w-[680px] mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-pixel text-[13px] text-white tracking-widest">NEW CAMPAIGN</h1>
          <a href="/campaigns" className="text-xs text-slate-500 hover:text-slate-400 transition-colors font-medium">← Back</a>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center mb-2.5">
            {STEPS.map((_, i) => (
              <React.Fragment key={i}>
                <button
                  onClick={() => goTo(i + 1)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                    i + 1 === step
                      ? 'bg-gradient-to-br from-blue-700 to-blue-500 text-white shadow-lg shadow-blue-500/40'
                      : i + 1 < step
                      ? 'bg-blue-600/15 text-blue-400 border border-blue-500/40'
                      : 'bg-white/5 text-slate-600 border border-white/8'
                  }`}
                >
                  {i + 1}
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 transition-colors ${i + 1 < step ? 'bg-blue-500/40' : 'bg-white/[0.06]'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="flex justify-between">
            {STEPS.map((label, i) => (
              <span
                key={label}
                className={`font-pixel text-[5px] w-8 text-center leading-relaxed transition-colors ${
                  i + 1 === step ? 'text-blue-400' : i + 1 < step ? 'text-blue-600' : 'text-slate-700'
                }`}
              >
                {label.split(' ').map((w, j) => <span key={j} className="block">{w}</span>)}
              </span>
            ))}
          </div>
        </div>

        {(stepError || submitError) && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {stepError || submitError}
          </div>
        )}

        <div className="bg-[#0D1117] border border-white/[0.07] rounded-2xl overflow-hidden">
          {/* Step panels */}
          <div className="p-8 pb-6">
            {step === 1 && (
              <>
                <div className="font-pixel text-[10px] text-blue-400 tracking-[3px] mb-7">THE QUEST</div>
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-2 tracking-wide">
                      Campaign Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-slate-200 text-sm placeholder-slate-700 focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.06] transition-all"
                      placeholder="Enter campaign name..."
                      maxLength={60}
                      value={name}
                      onChange={e => setName(e.target.value)}
                    />
                    <div className="text-right text-xs text-slate-700 mt-1.5">{name.length}/60</div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-2 tracking-wide">
                      Description <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-slate-200 text-sm placeholder-slate-700 focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.06] transition-all resize-y min-h-[110px]"
                      placeholder="Describe your campaign..."
                      maxLength={500}
                      rows={4}
                      value={desc}
                      onChange={e => setDesc(e.target.value)}
                    />
                    <div className={`text-right text-xs mt-1.5 ${desc.length > 450 ? 'text-amber-500' : 'text-slate-700'}`}>
                      {desc.length}/500
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-2 tracking-wide">
                      Banner Image <span className="text-slate-600 font-normal">(optional)</span>
                    </label>
                    <div
                      className="border-2 border-dashed border-white/10 rounded-xl p-7 text-center cursor-pointer hover:border-blue-500/40 hover:bg-blue-600/[0.04] transition-all"
                      onClick={() => fileRef.current?.click()}
                    >
                      {imagePreview ? (
                        <img src={imagePreview} className="max-w-full max-h-48 rounded-lg object-cover mx-auto" alt="Preview" />
                      ) : (
                        <>
                          <div className="text-3xl mb-2">🖼</div>
                          <div className="text-sm text-slate-500">Click to upload a banner image</div>
                          <div className="text-xs text-slate-700 mt-1">PNG, JPG, GIF up to 5MB</div>
                        </>
                      )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={handleImageChange} />
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="font-pixel text-[10px] text-blue-400 tracking-[3px] mb-7">THE SCHEDULE</div>
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-2 tracking-wide">Frequency</label>
                    <div className="flex flex-wrap gap-2">
                      {['weekly', 'biweekly', 'monthly'].map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setSchedFreq(f)}
                          className={`px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                            schedFreq === f
                              ? 'bg-blue-600/20 border-blue-500/60 text-blue-300'
                              : 'bg-white/[0.04] border-white/10 text-slate-500 hover:border-blue-500/30 hover:text-slate-400'
                          }`}
                        >
                          {f === 'weekly' ? 'Weekly' : f === 'biweekly' ? 'Bi-weekly' : 'Monthly'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-2 tracking-wide">Day of Week</label>
                    <div className="flex flex-wrap gap-2">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setSchedDay(d)}
                          className={`px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                            schedDay === d
                              ? 'bg-blue-600/20 border-blue-500/60 text-blue-300'
                              : 'bg-white/[0.04] border-white/10 text-slate-500 hover:border-blue-500/30 hover:text-slate-400'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-2 tracking-wide">Time</label>
                      <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)}
                        className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:border-blue-500/50 transition-all" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-2 tracking-wide">Timezone</label>
                      <select value={schedTz} onChange={e => setSchedTz(e.target.value)}
                        className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer">
                        {TIMEZONES.map(([val, label]) => <option key={val} value={val} className="bg-[#0D1117]">{label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="font-pixel text-[10px] text-blue-400 tracking-[3px] mb-7">THE GATHERING</div>
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-2 tracking-wide">
                      Communication Link <span className="text-slate-600 font-normal">(optional)</span>
                    </label>
                    <input type="url" value={callUrl} onChange={e => setCallUrl(e.target.value)}
                      placeholder="https://discord.gg/... or https://zoom.us/..."
                      className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-slate-200 text-sm placeholder-slate-700 focus:outline-none focus:border-blue-500/50 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-2 tracking-wide">
                      D&amp;D Beyond Campaign URL <span className="text-slate-600 font-normal">(optional)</span>
                    </label>
                    <input type="url" value={dndUrl} onChange={e => setDndUrl(e.target.value)}
                      placeholder="https://www.dndbeyond.com/campaigns/..."
                      className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-slate-200 text-sm placeholder-slate-700 focus:outline-none focus:border-blue-500/50 transition-all" />
                  </div>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <div className="font-pixel text-[10px] text-blue-400 tracking-[3px] mb-7">THE ROSTER</div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-3 tracking-wide">Max Player Slots</label>
                  <div className="flex flex-wrap gap-2.5">
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <button key={n} type="button" onClick={() => setMaxPlayers(n)}
                        className={`w-13 h-13 rounded-xl border text-base font-bold transition-all ${
                          maxPlayers === n
                            ? 'bg-blue-600/25 border-blue-500/70 text-blue-300 shadow-lg shadow-blue-500/20'
                            : 'bg-white/[0.04] border-white/10 text-slate-500 hover:border-blue-500/30 hover:text-slate-400'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-700 mt-3.5">The GM does not occupy a player slot.</p>
                </div>
              </>
            )}

            {step === 5 && (
              <>
                <div className="font-pixel text-[10px] text-blue-400 tracking-[3px] mb-7">REVIEW</div>
                <div className="space-y-4">
                  {[
                    { title: 'THE QUEST', rows: [['Name', name], ['Description', descShort]] },
                    { title: 'THE SCHEDULE', rows: [['Frequency', freqMap[schedFreq] ?? schedFreq], ['Day', schedDay || 'Not set'], ['Time', schedTime ? `${schedTime} ${schedTz}` : 'Not set']] },
                    { title: 'THE GATHERING', rows: [['Communication', callUrl || 'None'], ['D&D Beyond', dndUrl || 'None']] },
                    { title: 'THE ROSTER', rows: [['Max Players', `${maxPlayers} players`]] },
                  ].map(section => (
                    <div key={section.title}>
                      <div className="font-pixel text-[8px] text-slate-500 tracking-widest mb-2">{section.title}</div>
                      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-1">
                        {section.rows.map(([label, value]) => (
                          <div key={label} className="flex justify-between items-start py-1.5 border-b border-white/[0.04] last:border-0">
                            <span className="text-xs text-slate-500 font-medium">{label}</span>
                            <span className={`text-xs max-w-[60%] text-right break-words ${value ? 'text-slate-400' : 'text-slate-600 italic'}`}>
                              {value || 'Not set'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Footer nav */}
          <div className="flex items-center justify-between px-8 py-5 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={() => goTo(step - 1)}
              style={{ visibility: step === 1 ? 'hidden' : 'visible' }}
              className="px-5 py-2.5 rounded-xl border border-white/10 text-slate-500 text-sm font-semibold hover:border-white/20 hover:text-slate-400 transition-all bg-transparent"
            >
              ← Back
            </button>
            <span className="font-pixel text-[9px] text-slate-700">{step} / {STEPS.length}</span>
            {step < STEPS.length ? (
              <button
                type="button"
                onClick={() => goTo(step + 1)}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 text-white text-sm font-semibold hover:-translate-y-px hover:shadow-lg hover:shadow-blue-600/30 transition-all border-none"
              >
                Continue →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isLoading}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 text-white text-sm font-semibold hover:-translate-y-px hover:shadow-lg hover:shadow-blue-600/30 transition-all border-none disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isLoading ? 'Creating...' : '⚔ Create Campaign'}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
