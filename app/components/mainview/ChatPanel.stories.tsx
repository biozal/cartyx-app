import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChatPanel } from './ChatPanel'

const meta: Meta<typeof ChatPanel> = {
  title: 'Components/MainView/ChatPanel',
  component: ChatPanel,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div className="flex h-screen justify-end bg-[#080A12]">
        <div className="h-full w-80 border-l border-white/[0.07]">
          <Story />
        </div>
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
