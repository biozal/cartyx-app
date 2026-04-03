import type { Meta, StoryObj } from '@storybook/react-vite'
import { ConfirmDialog } from './ConfirmDialog'

const meta: Meta<typeof ConfirmDialog> = {
  title: 'Components/MainView/GMScreens/ConfirmDialog',
  component: ConfirmDialog,
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
    title: 'Delete Screen',
    message: 'Are you sure you want to delete "Combat Tracker"? This will remove all windows and stacks on this screen.',
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: () => {},
    onCancel: () => {},
  },
}
export default meta
type Story = StoryObj<typeof meta>

export const Danger: Story = {}

export const Normal: Story = {
  args: {
    title: 'Confirm Action',
    message: 'Are you sure you want to proceed?',
    confirmLabel: 'Confirm',
    danger: false,
  },
}

export const Loading: Story = {
  args: { isLoading: true },
}
