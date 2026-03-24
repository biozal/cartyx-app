import type { Meta, StoryObj } from '@storybook/react-vite'
import { Topbar } from './Topbar'

// useAuth and @tanstack/react-router are aliased to mocks in .storybook/main.ts viteFinal

const meta: Meta<typeof Topbar> = {
  title: 'Components/Topbar',
  component: Topbar,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithAvatar: Story = {
  render: () => <Topbar />,
}
