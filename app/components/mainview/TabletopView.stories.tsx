import type { Meta, StoryObj } from '@storybook/react-vite'
import { TabletopView } from './TabletopView'

const meta: Meta<typeof TabletopView> = {
  title: 'Components/MainView/TabletopView',
  component: TabletopView,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div className="h-screen bg-[#0D1117]">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
