import React from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ExternalLinkItem } from './ExternalLinkItem'

const meta: Meta<typeof ExternalLinkItem> = {
  title: 'Campaign/ExternalLinkItem',
  component: ExternalLinkItem,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="p-4 bg-[#0D1117]">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { name: 'Campaign Wiki', url: 'https://example.com/wiki' },
}

export const SharedNotes: Story = {
  args: { name: 'Shared Notes', url: 'https://notion.so/campaign' },
}

export const LongName: Story = {
  args: { name: 'The Complete Tome of Campaign Lore and World Building', url: 'https://example.com' },
}
