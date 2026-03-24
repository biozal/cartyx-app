import type { Meta, StoryObj } from '@storybook/react-vite'
import { Toast, showToast } from './Toast'

const meta: Meta<typeof Toast> = {
  title: 'Components/Toast',
  component: Toast,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <div>
      <Toast />
      <button
        onClick={() => showToast('Quest accepted! 🗡️')}
        className="px-4 py-2 bg-blue-600 text-white rounded text-sm"
      >
        Show Toast
      </button>
    </div>
  ),
}

export const LongMessage: Story = {
  render: () => (
    <div>
      <Toast />
      <button
        onClick={() => showToast('You have unlocked the legendary Sword of Infinite Debugging. +10 to Stack Overflow searches, -5 to sleep schedule.')}
        className="px-4 py-2 bg-blue-600 text-white rounded text-sm"
      >
        Show Long Toast
      </button>
    </div>
  ),
}
