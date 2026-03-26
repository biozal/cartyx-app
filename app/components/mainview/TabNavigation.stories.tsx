import type { Meta, StoryObj } from '@storybook/react-vite'
import { TabNavigation } from './TabNavigation'

const meta: Meta<typeof TabNavigation> = {
  title: 'Components/MainView/TabNavigation',
  component: TabNavigation,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    activeTab: 'dashboard',
    onTabChange: () => {},
  },
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const DashboardActive: Story = {
  args: {
    activeTab: 'dashboard',
  },
}

export const TabletopActive: Story = {
  args: {
    activeTab: 'tabletop',
  },
}
