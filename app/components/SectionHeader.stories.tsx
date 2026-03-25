import React from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { SectionHeader } from './SectionHeader'

const meta: Meta<typeof SectionHeader> = {
  title: 'UI/SectionHeader',
  component: SectionHeader,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-lg p-6 bg-[#080A12] space-y-4">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

export const SmallBlue: Story = {
  args: {
    children: 'THE QUEST',
    size: 'sm',
    color: 'blue',
  },
}

export const ExtraSmallBlue: Story = {
  args: {
    children: 'THE QUEST',
    size: 'xs',
    color: 'blue',
  },
}

export const MediumBlue: Story = {
  args: {
    children: 'THE SCHEDULE',
    size: 'md',
    color: 'blue',
  },
}

export const LargeBlue: Story = {
  args: {
    children: 'NEW CAMPAIGN',
    size: 'lg',
    color: 'blue',
  },
}

export const White: Story = {
  args: {
    children: 'BASIC INFO',
    size: 'md',
    color: 'white',
  },
}

export const Muted: Story = {
  args: {
    children: 'THE GATHERING',
    size: 'md',
    color: 'muted',
  },
}
