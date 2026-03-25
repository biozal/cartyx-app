import type { Meta, StoryObj } from '@storybook/react-vite'
import { SessionsListWidget } from './SessionsListWidget'
import { mockSessions } from '~/services/mocks/sessionsService'

const meta: Meta<typeof SessionsListWidget> = {
  title: 'Components/MainView/Widgets/SessionsListWidget',
  component: SessionsListWidget,
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
    sessions: mockSessions,
  },
}

export const Empty: Story = {
  args: {
    sessions: [],
  },
}
