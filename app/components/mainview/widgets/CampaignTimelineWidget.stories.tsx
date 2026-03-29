import type { Meta, StoryObj } from '@storybook/react-vite'
import { CampaignTimelineWidget } from './CampaignTimelineWidget'
import { mockTimelineEvents } from '~/services/mocks/timelineService'

const meta: Meta<typeof CampaignTimelineWidget> = {
  title: 'Components/MainView/Widgets/CampaignTimelineWidget',
  component: CampaignTimelineWidget,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-[#080A12] p-6">
        <div className="max-w-6xl">
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
    events: mockTimelineEvents,
  },
}

export const Empty: Story = {
  args: {
    events: [],
  },
}
