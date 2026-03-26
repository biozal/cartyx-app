import type { Meta, StoryObj } from '@storybook/react-vite'
import { DashboardView } from './DashboardView'
import { WidgetSlot } from './WidgetSlot'

const meta: Meta<typeof DashboardView> = {
  title: 'Components/DashboardView',
  component: DashboardView,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div className="h-screen bg-[#080A12]">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

export const EmptyState: Story = {
  render: () => <DashboardView />,
}

export const WithSampleWidgets: Story = {
  render: () => (
    <DashboardView>
      <WidgetSlot title="Session Recap">
        <div className="space-y-2 font-pixel text-xs text-slate-400">
          <p>The party cleared the outer keep.</p>
          <p>One sealed vault remains unexplored.</p>
        </div>
      </WidgetSlot>

      <WidgetSlot title="Initiative Queue">
        <div className="space-y-2 font-pixel text-xs text-slate-400">
          <p>1. Thorne</p>
          <p>2. Warden Shade</p>
          <p>3. Mira</p>
        </div>
      </WidgetSlot>

      <WidgetSlot title="Resource Tracker">
        <div className="space-y-2 font-pixel text-xs text-slate-400">
          <p>Torches: 4</p>
          <p>Rations: 9</p>
          <p>Potions: 2</p>
        </div>
      </WidgetSlot>

      <WidgetSlot title="Open Threads">
        <div className="space-y-2 font-pixel text-xs text-slate-400">
          <p>Find the missing cartographer.</p>
          <p>Decode the sigils in the archive.</p>
        </div>
      </WidgetSlot>
    </DashboardView>
  ),
}
