import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, userEvent } from 'storybook/test'
import { WikiPanel } from '~/components/wiki/WikiPanel'

const meta: Meta<typeof WikiPanel> = {
  title: 'Components/Wiki/WikiPanel',
  component: WikiPanel,
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

export const WithCategorySelected: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Characters' }))
  },
}
