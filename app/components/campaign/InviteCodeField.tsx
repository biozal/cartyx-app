import React from 'react'
import { showToast } from '~/components/Toast'

interface InviteCodeFieldProps {
  code: string
}

export function InviteCodeField({ code }: InviteCodeFieldProps) {
  function handleCopy() {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(code)
        .then(() => showToast(`✓ Invite code copied: ${code}`))
        .catch(() => showToast(`Code: ${code}`))
    } else {
      showToast(`Code: ${code}`)
    }
  }

  return (
    <div>
      <div className="text-[10px] font-sans font-semibold text-slate-500 tracking-wide mb-2">INVITE CODE</div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={code}
          className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-slate-300 text-sm font-mono focus:outline-none"
          aria-label="Invite code"
        />
        <button
          onClick={handleCopy}
          className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-slate-400 text-sm hover:text-white hover:bg-white/[0.08] transition-colors"
          aria-label="Copy invite code"
        >
          📋
        </button>
      </div>
    </div>
  )
}
