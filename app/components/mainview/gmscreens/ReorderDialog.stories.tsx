import type { Meta, StoryObj } from '@storybook/react-vite'
import { ReorderDialog } from './ReorderDialog'
import type { GMScreenData } from '~/types/gmscreen'

const mockScreens: GMScreenData[] = [
  { id: 's-1', campaignId: 'c-1', name: 'Combat Tracker', tabOrder: 0, createdBy: 'u-1', createdAt: '', updatedAt: '' },
  { id: 's-2', campaignId: 'c-1', name: 'NPC Notes', tabOrder: 1, createdBy: 'u-1', createdAt: '', updatedAt: '' },
  { id: 's-3', campaignId: 'c-1', name: 'World Map', tabOrder: 2, createdBy: 'u-1', createdAt: '', updatedAt: '' },
  { id: 's-4', campaignId: 'c-1', name: 'Session Log', tabOrder: 3, createdBy: 'u-1', createdAt: '', updatedAt: '' },
]

const meta: Meta<typeof ReorderDialog> = {
  title: 'Components/MainView/GMScreens/ReorderDialog',
  component: ReorderDialog,
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
    screens: mockScreens,
    onSubmit: () => {},
    onCancel: () => {},
  },
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Loading: Story = {
  args: { isLoading: true },
}
