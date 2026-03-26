import type { Meta, StoryObj } from '@storybook/react-vite'
import { WidgetSlot } from './WidgetSlot'

const meta: Meta<typeof WidgetSlot> = {
  title: 'Components/WidgetSlot',
  component: WidgetSlot,
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

export const Default: Story = {
  args: {
    title: 'Session Notes',
    children: (
      <div className="space-y-2 font-pixel text-xs text-slate-400">
        <p>Last checkpoint reached.</p>
        <p>Next objective: descend into the crypt.</p>
      </div>
    ),
  },
}

export const WithLongContent: Story = {
  args: {
    title: 'Timeline',
    children: (
      <div className="space-y-3 font-pixel text-xs text-slate-400">
        <p>The party crossed the marsh at dawn and tracked the cultists toward the drowned watchtower.</p>
        <p>Scattered ritual markings suggest a second site somewhere beneath the eastern cliffs.</p>
        <p>Recovered clues point to an eclipse window, which narrows the response time to the next session.</p>
        <p>The local garrison remains unreliable, so the group will likely proceed without reinforcements.</p>
      </div>
    ),
  },
}
