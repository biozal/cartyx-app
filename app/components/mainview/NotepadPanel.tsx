import React from 'react'

export function NotepadPanel() {
  return (
    <div data-testid="notepad-panel" className="flex h-full flex-col bg-[#080A12]">
      <div className="border-b border-white/[0.07] px-4 py-3">
        <h2 className="font-pixel text-xs text-slate-300">Notepad</h2>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <span className="font-pixel text-xs text-slate-500">Coming Soon</span>
      </div>
    </div>
  )
}
