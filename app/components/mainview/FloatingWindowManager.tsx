import type { ReactNode } from 'react'
import {
  FloatingWindow,
  type FloatingWindowPosition,
  type FloatingWindowSize,
  type FloatingWindowState,
} from './FloatingWindow'
import { FloatingWindowTray } from './FloatingWindowTray'

export interface ManagedWindow {
  id: string
  title: string
  content: ReactNode
  position?: FloatingWindowPosition
  size?: FloatingWindowSize
  state: FloatingWindowState
  zIndex: number
}

export interface FloatingWindowManagerProps {
  windows: ManagedWindow[]
  onWindowsChange: (windows: ManagedWindow[]) => void
  className?: string
}

function getHighestZIndex(windows: ManagedWindow[]) {
  return windows.reduce((max, window) => Math.max(max, window.zIndex), 0)
}

export function FloatingWindowManager({
  windows,
  onWindowsChange,
  className = '',
}: FloatingWindowManagerProps) {
  const activeWindows = windows.filter(window => window.state !== 'minimized')
  const minimizedWindows = windows.filter(window => window.state === 'minimized')

  const handleFocus = (id: string) => {
    const highestZIndex = getHighestZIndex(windows)

    onWindowsChange(
      windows.map(window => (
        window.id === id
          ? { ...window, zIndex: highestZIndex + 1 }
          : window
      )),
    )
  }

  const handleClose = (id: string) => {
    onWindowsChange(windows.filter(window => window.id !== id))
  }

  const handleStateChange = (id: string, state: FloatingWindowState) => {
    const highestZIndex = getHighestZIndex(windows)

    onWindowsChange(
      windows.map(window => {
        if (window.id !== id) {
          return window
        }

        return {
          ...window,
          state,
          zIndex: state === 'normal' ? highestZIndex + 1 : window.zIndex,
        }
      }),
    )
  }

  const handleRestore = (id: string) => {
    handleStateChange(id, 'normal')
  }

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      {activeWindows.map(window => (
        <FloatingWindow
          key={window.id}
          id={window.id}
          title={window.title}
          initialPosition={window.position}
          initialSize={window.size}
          initialState={window.state}
          zIndex={window.zIndex}
          onFocus={() => handleFocus(window.id)}
          onClose={() => handleClose(window.id)}
          onStateChange={(state) => handleStateChange(window.id, state)}
        >
          {window.content}
        </FloatingWindow>
      ))}

      <FloatingWindowTray
        windows={minimizedWindows.map(window => ({ id: window.id, title: window.title }))}
        onRestore={handleRestore}
      />
    </div>
  )
}
