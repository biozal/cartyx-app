import { useState, useCallback, useEffect, useRef } from 'react'

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((message: string) => {
    // Clear any existing timeout
    if (timerRef.current) clearTimeout(timerRef.current)
    setState({ message, visible: true })
    timerRef.current = setTimeout(() => {
      setState(s => ({ ...s, visible: false }))
      timerRef.current = null
    }, 2400)
  }, [])

  // Register/cleanup global handler
  useEffect(() => {
    _showToast = show
    return () => {
      _showToast = null
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [show])

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
