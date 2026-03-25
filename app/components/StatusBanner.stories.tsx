import React from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { StatusBanner } from './StatusBanner'

const meta: Meta<typeof StatusBanner> = {
  title: 'UI/StatusBanner',
  component: StatusBanner,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-lg p-6 bg-[#080A12] space-y-3">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

export const Error: Story = {
  args: {
    variant: 'error',
    message: 'Campaign name is required.',
  },
}

export const Warning: Story = {
  args: {
    variant: 'warning',
    message: 'This campaign is paused and not visible to players.',
  },
}

export const Info: Story = {
  args: {
    variant: 'info',
    message: 'Changes will take effect after the next session.',
  },
}

export const Success: Story = {
  args: {
    variant: 'success',
    message: 'Campaign saved successfully.',
  },
}

export const Dismissible: Story = {
  args: {
    variant: 'info',
    message: 'Click the × to dismiss this banner.',
    dismissible: true,
    onDismiss: () => {},
  },
}
