import type { Meta, StoryObj } from '@storybook/react-vite'
import { GMScreensView } from './GMScreensView'

// useGMScreens is aliased to .storybook/mocks/useGMScreens.ts in viteFinal

const meta: Meta<typeof GMScreensView> = {
  title: 'Components/MainView/GMScreens/GMScreensView',
  component: GMScreensView,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-screen bg-[#080A12]">
        <Story />
      </div>
    ),
  ],
  args: {
    campaignId: 'campaign-abc',
  },
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
