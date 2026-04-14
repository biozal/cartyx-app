import type { Meta, StoryObj } from '@storybook/react-vite'
import { ScreenNameDialog } from './ScreenNameDialog'

const meta: Meta<typeof ScreenNameDialog> = {
  title: 'Components/MainView/GMScreens/ScreenNameDialog',
  component: ScreenNameDialog,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="bg-[#080A12] min-h-screen">
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'New Screen',
    initialName: '',
    onSubmit: () => {},
    onCancel: () => {},
  },
}
export default meta
type Story = StoryObj<typeof meta>

export const CreateNew: Story = {}

export const Rename: Story = {
  args: {
    title: 'Rename Screen',
    initialName: 'Combat Tracker',
  },
}

export const WithError: Story = {
  args: {
    title: 'New Screen',
    error: 'A screen with that name already exists in this campaign',
  },
}

export const Loading: Story = {
  args: {
    title: 'New Screen',
    isLoading: true,
  },
}
