import type { Meta, StoryObj } from '@storybook/react-vite'
import { CampaignHeader } from './CampaignHeader'

// useAuth and @tanstack/react-router are aliased to mocks in .storybook/main.ts viteFinal

const meta: Meta<typeof CampaignHeader> = {
  title: 'Components/MainView/CampaignHeader',
  component: CampaignHeader,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    campaignId: 'campaign-abc',
    sessionNumber: 66,
    activeTab: 'dashboard',
    onTabChange: () => {},
  },
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    activeTab: 'dashboard',
  },
}

export const TabletopActive: Story = {
  args: {
    activeTab: 'tabletop',
  },
}

export const NoSessionNumber: Story = {
  args: {
    sessionNumber: undefined,
  },
}
