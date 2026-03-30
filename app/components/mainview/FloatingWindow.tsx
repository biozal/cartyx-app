import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { ChevronDown, Maximize2, Minimize2, X } from 'lucide-react'

export interface FloatingWindowPosition {
  x: number
  y: number
}

export interface FloatingWindowSize {
  width: number
  height: number
}

export type FloatingWindowState = 'normal' | 'minimized' | 'maximized'

export interface FloatingWindowProps {
  id: string
  title: string
  children: ReactNode
  initialPosition?: FloatingWindowPosition
  initialSize?: FloatingWindowSize
  initialState?: FloatingWindowState
  zIndex?: number
  onClose?: () => void
  onFocus?: () => void
  onStateChange?: (state: FloatingWindowState) => void
  className?: string
}

const DEFAULT_POSITION: FloatingWindowPosition = { x: 100, y: 100 }
const DEFAULT_SIZE: FloatingWindowSize = { width: 400, height: 300 }
const TITLE_BAR_HEIGHT = 36
const MIN_VISIBLE_TITLE_WIDTH = 50
const MIN_WIDTH = 200
const MIN_HEIGHT = 150

interface DragState {
  offsetX: number
  offsetY: number
}

interface ResizeState {
  startX: number
  startY: number
  startWidth: number
  startHeight: number
}

function clampPosition(
  nextPosition: FloatingWindowPosition,
  size: FloatingWindowSize,
  parent: HTMLElement | null,
): FloatingWindowPosition {
  if (!parent) {
    return nextPosition
  }

  const maxX = parent.clientWidth - MIN_VISIBLE_TITLE_WIDTH
  const minX = MIN_VISIBLE_TITLE_WIDTH - size.width
  const minY = 0
  const maxY = parent.clientHeight - TITLE_BAR_HEIGHT

  return {
    x: Math.min(Math.max(nextPosition.x, minX), maxX),
    y: Math.min(Math.max(nextPosition.y, minY), maxY),
  }
}

export function FloatingWindow({
  id,
  title,
  children,
  initialPosition = DEFAULT_POSITION,
  initialSize = DEFAULT_SIZE,
  initialState = 'normal',
  zIndex = 1,
  onClose,
  onFocus,
  onStateChange,
  className = '',
}: FloatingWindowProps) {
  const [position, setPosition] = useState<FloatingWindowPosition>(initialPosition)
  const [size, setSize] = useState<FloatingWindowSize>(initialSize)
  const [windowState, setWindowState] = useState<FloatingWindowState>(initialState)
  const [isFocused, setIsFocused] = useState(false)

  const windowRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const resizeStateRef = useRef<ResizeState | null>(null)
  const positionRef = useRef<FloatingWindowPosition>(initialPosition)
  const sizeRef = useRef<FloatingWindowSize>(initialSize)
  const titleId = useId()

  useEffect(() => {
    setWindowState(initialState)
  }, [initialState])

  const focusWindow = useCallback(() => {
    const element = windowRef.current
    if (element && document.activeElement !== element) {
      element.focus()
    }
    onFocus?.()
  }, [onFocus])

  const setState = useCallback((nextState: FloatingWindowState) => {
    setWindowState(nextState)
    onStateChange?.(nextState)
  }, [onStateChange])

  const handleMinimize = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    setState('minimized')
  }, [setState])

  const handleMaximizeToggle = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    setState(windowState === 'maximized' ? 'normal' : 'maximized')
  }, [setState, windowState])

  const handleClose = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onClose?.()
  }, [onClose])

  const handleWindowMouseDown = useCallback(() => {
    focusWindow()
  }, [focusWindow])

  const handleTitleBarMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (windowState === 'maximized') {
      handleWindowMouseDown()
      return
    }

    handleWindowMouseDown()
    dragStateRef.current = {
      offsetX: event.clientX - position.x,
      offsetY: event.clientY - position.y,
    }
  }, [handleWindowMouseDown, position.x, position.y, windowState])

  const handleResizeMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (windowState === 'maximized') {
      return
    }

    handleWindowMouseDown()
    resizeStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: size.width,
      startHeight: size.height,
    }
  }, [handleWindowMouseDown, size.height, size.width, windowState])

  const handleDocumentMouseMove = useCallback((event: MouseEvent) => {
    const element = windowRef.current
    const parent = element?.parentElement ?? null

    if (dragStateRef.current && element) {
      const nextPosition = clampPosition(
        {
          x: event.clientX - dragStateRef.current.offsetX,
          y: event.clientY - dragStateRef.current.offsetY,
        },
        sizeRef.current,
        parent,
      )
      positionRef.current = nextPosition
      setPosition(nextPosition)
      return
    }

    if (resizeStateRef.current && element) {
      const nextSize = {
        width: Math.max(
          MIN_WIDTH,
          resizeStateRef.current.startWidth + (event.clientX - resizeStateRef.current.startX),
        ),
        height: Math.max(
          MIN_HEIGHT,
          resizeStateRef.current.startHeight + (event.clientY - resizeStateRef.current.startY),
        ),
      }
      sizeRef.current = nextSize
      const nextPosition = clampPosition(positionRef.current, nextSize, parent)
      positionRef.current = nextPosition
      setSize(nextSize)
      setPosition(nextPosition)
    }
  }, []) // stable — reads from refs, not state

  const handleDocumentMouseUp = useCallback(() => {
    dragStateRef.current = null
    resizeStateRef.current = null
  }, [])

  useEffect(() => {
    document.addEventListener('mousemove', handleDocumentMouseMove)
    document.addEventListener('mouseup', handleDocumentMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove)
      document.removeEventListener('mouseup', handleDocumentMouseUp)
    }
  }, [handleDocumentMouseMove, handleDocumentMouseUp])

  if (windowState === 'minimized') {
    return null
  }

  const isMaximized = windowState === 'maximized'
  const maximizeLabel = isMaximized ? `Restore ${title}` : `Maximize ${title}`
  const maximizeIcon = isMaximized ? (
    <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
  ) : (
    <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
  )

  return (
    <div
      ref={windowRef}
      role="dialog"
      aria-labelledby={titleId}
      data-window-id={id}
      tabIndex={0}
      onMouseDown={handleWindowMouseDown}
      onFocusCapture={() => setIsFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsFocused(false)
        }
      }}
      className={[
        'rounded-lg border border-white/[0.07] bg-[#0D1117] overflow-hidden shadow-2xl shadow-black/60 outline-none',
        isMaximized ? 'absolute inset-0' : 'absolute left-0 top-0',
        className,
      ].join(' ')}
      style={isMaximized ? { zIndex } : {
        zIndex,
        width: size.width,
        height: size.height,
        transform: `translate(${position.x}px, ${position.y}px)`,
      }}
    >
      <div
        className={[
          'flex h-9 cursor-move items-center justify-between gap-3 border-b border-white/[0.07] px-3',
          isFocused ? 'bg-[#242942]' : 'bg-[#1a1d2e]',
          isMaximized ? 'cursor-default' : '',
        ].join(' ')}
        onMouseDown={handleTitleBarMouseDown}
      >
        <div id={titleId} className="truncate font-sans font-semibold text-xs text-slate-300">
          {title}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-label={`Minimize ${title}`}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={handleMinimize}
            className="flex h-5 w-5 items-center justify-center rounded bg-yellow-500/20 text-yellow-400 transition-colors hover:bg-yellow-500/40"
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={maximizeLabel}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={handleMaximizeToggle}
            className="flex h-5 w-5 items-center justify-center rounded bg-green-500/20 text-green-400 transition-colors hover:bg-green-500/40"
          >
            {maximizeIcon}
          </button>
          <button
            type="button"
            aria-label={`Close ${title}`}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={handleClose}
            className="flex h-5 w-5 items-center justify-center rounded bg-red-500/20 text-red-400 transition-colors hover:bg-red-500/40"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="h-[calc(100%-36px)] overflow-auto">
        {children}
      </div>

      {!isMaximized ? (
        <div
          aria-hidden="true"
          onMouseDown={handleResizeMouseDown}
          className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize bg-[linear-gradient(135deg,transparent_0%,transparent_45%,rgba(148,163,184,0.4)_45%,rgba(148,163,184,0.4)_55%,transparent_55%,transparent_100%)]"
        />
      ) : null}
    </div>
  )
}
