import React from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { NextSessionBadge } from './NextSessionBadge'

const meta: Meta<typeof NextSessionBadge> = {
  title: 'Campaign/NextSessionBadge',
  component: NextSessionBadge,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-sm p-4 bg-[#0D1117]">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    nextSession: { day: 'Friday', time: '19:00' },
    schedule: { time: '19:00', timezone: 'America/Chicago' },
  },
}

export const NotScheduled: Story = {
  args: {
    nextSession: null,
    schedule: { time: null, timezone: null },
  },
}

export const WeekendMorning: Story = {
  args: {
    nextSession: { day: 'Saturday', time: '10:00' },
    schedule: { time: '10:00', timezone: 'America/New_York' },
  },
}
