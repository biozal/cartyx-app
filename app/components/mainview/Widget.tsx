import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Maximize2, X } from 'lucide-react'

export interface WidgetProps {
  title: string
  children: ReactNode
  className?: string
  defaultMinimized?: boolean
}

export function Widget({
  title,
  children,
  className = '',
  defaultMinimized = false,
}: WidgetProps) {
  const [isMinimized, setIsMinimized] = useState(defaultMinimized)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleMinimized = () => {
    setIsMinimized((current) => !current)
  }

  const openFullscreen = () => {
    setIsFullscreen(true)
  }

  const closeFullscreen = () => {
    setIsFullscreen(false)
  }

  const titleBar = (
    <header
      className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3"
      onDoubleClick={toggleMinimized}
    >
      <div className="flex items-center gap-2">
        {isMinimized ? (
          <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-slate-500" />
        ) : null}
        <h2 className="font-pixel text-xs text-slate-300">{title}</h2>
      </div>

      <button
        type="button"
        onClick={openFullscreen}
        className="text-slate-500 transition-colors hover:text-white"
        aria-label={`Open ${title} in fullscreen`}
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </button>
    </header>
  )

  return (
    <>
      <section className={`rounded-lg border border-white/[0.07] bg-[#0D1117] ${className}`}>
        {titleBar}
        {!isMinimized ? (
          <div className="min-h-[200px] p-4">
            {children}
          </div>
        ) : null}
      </section>

      {isFullscreen
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
              <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-lg border border-white/[0.07] bg-[#0D1117]">
                <header className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                  <h2 className="font-pixel text-xs text-slate-300">{title}</h2>

                  <button
                    type="button"
                    onClick={closeFullscreen}
                    className="text-slate-500 transition-colors hover:text-white"
                    aria-label={`Close ${title} fullscreen`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </header>

                <div className="min-h-[200px] p-4">
                  {children}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
