import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  FloatingWindow,
  type FloatingWindowPosition,
  type FloatingWindowSize,
  type FloatingWindowState,
} from './FloatingWindow'
import {
  FloatingWindowManager,
  type ManagedWindow,
} from './FloatingWindowManager'
import { FloatingWindowTray } from './FloatingWindowTray'

interface StoryWindowConfig {
  id: string
  title: string
  position?: FloatingWindowPosition
  size?: FloatingWindowSize
  state: FloatingWindowState
  zIndex: number
  content: string[]
}

const meta: Meta<typeof FloatingWindow> = {
  title: 'Components/MainView/FloatingWindow',
  component: FloatingWindow,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div className="h-screen bg-[#080A12] p-6">
        <div className="h-full rounded-2xl border border-white/[0.07] bg-[#0D1117] p-4">
          <Story />
        </div>
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof meta>

function WindowContent({ lines }: { lines: string[] }) {
  return (
    <div className="space-y-2 p-4 font-pixel text-xs text-slate-400">
      {lines.map(line => (
        <p key={line}>{line}</p>
      ))}
    </div>
  )
}

function FloatingWindowCanvas({
  initialWindows,
  useManager = false,
}: {
  initialWindows: StoryWindowConfig[]
  useManager?: boolean
}) {
  const [windows, setWindows] = useState<StoryWindowConfig[]>(initialWindows)

  if (useManager) {
    const managedWindows: ManagedWindow[] = windows.map(window => ({
      id: window.id,
      title: window.title,
      position: window.position,
      size: window.size,
      state: window.state,
      zIndex: window.zIndex,
      content: <WindowContent lines={window.content} />,
    }))

    return (
      <div className="relative h-full w-full overflow-hidden rounded-xl bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.16),transparent_38%),linear-gradient(180deg,#111827_0%,#0D1117_100%)]">
        <FloatingWindowManager
          windows={managedWindows}
          onWindowsChange={(nextWindows) => {
            setWindows(current => nextWindows.map(nextWindow => {
              const existingWindow = current.find(window => window.id === nextWindow.id)

              return {
                id: nextWindow.id,
                title: nextWindow.title,
                position: nextWindow.position,
                size: nextWindow.size,
                state: nextWindow.state,
                zIndex: nextWindow.zIndex,
                content: existingWindow?.content ?? [],
              }
            }))
          }}
        />
      </div>
    )
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.12),transparent_36%),linear-gradient(180deg,#111827_0%,#0D1117_100%)]">
      {windows.filter(window => window.state !== 'minimized').map(window => (
        <FloatingWindow
          key={window.id}
          id={window.id}
          title={window.title}
          initialPosition={window.position}
          initialSize={window.size}
          initialState={window.state}
          zIndex={window.zIndex}
          onClose={() => setWindows(current => current.filter(item => item.id !== window.id))}
          onFocus={() => {
            setWindows(current => {
              const highestZIndex = current.reduce((max, item) => Math.max(max, item.zIndex), 0)

              return current.map(item => (
                item.id === window.id
                  ? { ...item, zIndex: highestZIndex + 1 }
                  : item
              ))
            })
          }}
          onStateChange={(state) => {
            setWindows(current => {
              const highestZIndex = current.reduce((max, item) => Math.max(max, item.zIndex), 0)

              return current.map(item => (
                item.id === window.id
                  ? {
                    ...item,
                    state,
                    zIndex: state === 'normal' ? highestZIndex + 1 : item.zIndex,
                  }
                  : item
              ))
            })
          }}
        >
          <WindowContent lines={window.content} />
        </FloatingWindow>
      ))}

      <FloatingWindowTray
        windows={windows
          .filter(window => window.state === 'minimized')
          .map(window => ({ id: window.id, title: window.title }))}
        onRestore={(id) => {
          setWindows(current => {
            const highestZIndex = current.reduce((max, window) => Math.max(max, window.zIndex), 0)

            return current.map(window => (
              window.id === id
                ? { ...window, state: 'normal', zIndex: highestZIndex + 1 }
                : window
            ))
          })
        }}
      />
    </div>
  )
}

export const SingleWindow: Story = {
  render: () => (
    <FloatingWindowCanvas
      initialWindows={[
        {
          id: 'wiki',
          title: 'Ruined Observatory',
          position: { x: 96, y: 72 },
          size: { width: 420, height: 320 },
          state: 'normal',
          zIndex: 3,
          content: [
            'The upper dome still rotates when moonlight strikes the brass teeth.',
            'A hidden stair behind the star chart descends into a sealed archive.',
          ],
        },
      ]}
    />
  ),
}

export const MultipleWindows: Story = {
  render: () => (
    <FloatingWindowCanvas
      initialWindows={[
        {
          id: 'map',
          title: 'Flooded Catacombs Map',
          position: { x: 60, y: 60 },
          size: { width: 420, height: 280 },
          state: 'normal',
          zIndex: 2,
          content: ['Northern culvert remains passable at low tide.', 'Sanctum marker glows when the sluice gate opens.'],
        },
        {
          id: 'sheet',
          title: 'Aster Vane Character Sheet',
          position: { x: 260, y: 130 },
          size: { width: 360, height: 340 },
          state: 'normal',
          zIndex: 4,
          content: ['Passive perception: 17', 'Prepared rituals: Detect Magic, Tiny Hut, Speak with Dead'],
        },
        {
          id: 'notes',
          title: 'Session Notes',
          position: { x: 520, y: 90 },
          size: { width: 320, height: 240 },
          state: 'normal',
          zIndex: 1,
          content: ['The ferryman recognized the party crest.', 'Clocktower bells rang thirteen times at dusk.'],
        },
      ]}
    />
  ),
}

export const WithMinimizedTray: Story = {
  render: () => (
    <FloatingWindowCanvas
      initialWindows={[
        {
          id: 'map',
          title: 'City Ward Map',
          position: { x: 80, y: 60 },
          size: { width: 420, height: 280 },
          state: 'normal',
          zIndex: 4,
          content: ['Blue lantern districts stay under curfew after midnight.', 'Western market gate now has a second checkpoint.'],
        },
        {
          id: 'notes',
          title: 'Council Notes',
          position: { x: 360, y: 140 },
          size: { width: 320, height: 250 },
          state: 'normal',
          zIndex: 3,
          content: ['The archivist requested proof before releasing the treaty.', 'Captain Merrow suspects a spy in the mint.'],
        },
        {
          id: 'wiki',
          title: 'Wiki: Ember Court',
          state: 'minimized',
          zIndex: 1,
          content: ['Minimized wiki entry.'],
        },
        {
          id: 'sheet',
          title: 'Sheet: Nyra Flint',
          state: 'minimized',
          zIndex: 2,
          content: ['Minimized character sheet.'],
        },
      ]}
    />
  ),
}

export const ManagerDemo: Story = {
  render: () => (
    <FloatingWindowCanvas
      useManager
      initialWindows={[
        {
          id: 'map',
          title: 'Underkeep Map',
          position: { x: 72, y: 68 },
          size: { width: 440, height: 300 },
          state: 'normal',
          zIndex: 2,
          content: ['Pressure plates line the southern gallery.', 'A collapsed tunnel hides the old reliquary door.'],
        },
        {
          id: 'sheet',
          title: 'Ser Caldus Sheet',
          position: { x: 300, y: 130 },
          size: { width: 360, height: 340 },
          state: 'normal',
          zIndex: 5,
          content: ['Armor Class: 19', 'Hit Dice remaining: 3', 'Oath focus etched with silver ash runes.'],
        },
        {
          id: 'notes',
          title: 'DM Notes',
          position: { x: 580, y: 90 },
          size: { width: 320, height: 260 },
          state: 'normal',
          zIndex: 3,
          content: ['Villain enters if the brazier is lit.', 'Reward clue points toward the drowned archives.'],
        },
      ]}
    />
  ),
}
