import type { Meta, StoryObj } from '@storybook/react-vite'
import { DashboardView } from './DashboardView'
import { Widget } from './Widget'

const meta: Meta<typeof Widget> = {
  title: 'Components/Widget',
  component: Widget,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-[#080A12] p-6">
        <div className="max-w-md">
          <Story />
        </div>
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

const sampleContent = (
  <div className="space-y-2 font-pixel text-xs text-slate-400">
    <p>Ward sigils remain active around the archive door.</p>
    <p>The key fragment recovered from the chapel fits the lower lock.</p>
  </div>
)

export const Default: Story = {
  args: {
    title: 'Archive Status',
    children: sampleContent,
  },
}

export const Minimized: Story = {
  args: {
    title: 'Archive Status',
    defaultMinimized: true,
    children: sampleContent,
  },
}

export const InDashboardGrid: Story = {
  render: () => (
    <div className="min-h-screen bg-[#080A12]">
      <DashboardView>
        <Widget title="Session Recap">
          <div className="space-y-2 font-pixel text-xs text-slate-400">
            <p>The party breached the eastern gate.</p>
            <p>Two cultists escaped into the lower tunnels.</p>
          </div>
        </Widget>

        <Widget title="Threat Monitor">
          <div className="space-y-2 font-pixel text-xs text-slate-400">
            <p>Watchtower wards: unstable</p>
            <p>Corruption spread: 38%</p>
          </div>
        </Widget>

        <Widget title="Supply Ledger" defaultMinimized>
          <div className="space-y-2 font-pixel text-xs text-slate-400">
            <p>Rations: 6</p>
            <p>Potions: 2</p>
          </div>
        </Widget>
      </DashboardView>
    </div>
  ),
}
