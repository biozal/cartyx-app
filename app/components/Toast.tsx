import { useState, useCallback } from 'react'

interface ToastState {
  message: string
  visible: boolean
}

let _showToast: ((msg: string) => void) | null = null

export function showToast(message: string) {
  _showToast?.(message)
}

export function Toast() {
  const [state, setState] = useState<ToastState>({ message: '', visible: false })

  const show = useCallback((message: string) => {
    setState({ message, visible: true })
    setTimeout(() => setState(s => ({ ...s, visible: false })), 2400)
  }, [])

  // register global handler
  _showToast = show

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-7 left-1/2 z-50 -translate-x-1/2 transition-transform duration-300 ease-spring
        bg-slate-800 border border-blue-500/30 rounded-xl px-5 py-3 text-sm text-blue-300 font-medium whitespace-nowrap
        ${state.visible ? 'translate-y-0' : 'translate-y-20 pointer-events-none'}`}
    >
      {state.message}
    </div>
  )
}
