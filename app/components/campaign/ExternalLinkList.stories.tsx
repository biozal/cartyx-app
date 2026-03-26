import React from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ExternalLinkList } from './ExternalLinkList'

const meta: Meta<typeof ExternalLinkList> = {
  title: 'Campaign/ExternalLinkList',
  component: ExternalLinkList,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-xs p-4 bg-[#0D1117]">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    links: [
      { name: 'Campaign Wiki', url: 'https://example.com/wiki' },
      { name: 'Shared Notes', url: 'https://notion.so/campaign' },
      { name: 'Character Sheets', url: 'https://dndbeyond.com' },
    ],
  },
}

export const SingleLink: Story = {
  args: {
    links: [{ name: 'Campaign Wiki', url: 'https://example.com/wiki' }],
  },
}

export const Empty: Story = {
  args: { links: [] },
}
