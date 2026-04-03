import type { Meta, StoryObj } from '@storybook/react-vite'
import { ScreenBar } from './ScreenBar'
import type { GMScreenData } from '~/server/functions/gmscreens'

const mockScreens: GMScreenData[] = [
  { id: 'screen-1', campaignId: 'camp-1', name: 'Combat Tracker', tabOrder: 0, createdBy: 'u-1', createdAt: '', updatedAt: '' },
  { id: 'screen-2', campaignId: 'camp-1', name: 'NPC Notes', tabOrder: 1, createdBy: 'u-1', createdAt: '', updatedAt: '' },
  { id: 'screen-3', campaignId: 'camp-1', name: 'World Map', tabOrder: 2, createdBy: 'u-1', createdAt: '', updatedAt: '' },
]

const meta: Meta<typeof ScreenBar> = {
  title: 'Components/MainView/GMScreens/ScreenBar',
  component: ScreenBar,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="bg-[#080A12] min-h-[120px]">
        <Story />
      </div>
    ),
  ],
  args: {
    screens: mockScreens,
    activeScreenId: 'screen-1',
    onSelectScreen: () => {},
    onCreateScreen: () => {},
    onRenameScreen: () => {},
    onDeleteScreen: () => {},
    onReorderScreens: () => {},
  },
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const SecondActive: Story = {
  args: { activeScreenId: 'screen-2' },
}

export const SingleScreen: Story = {
  args: {
    screens: [mockScreens[0]],
    activeScreenId: 'screen-1',
  },
}

export const ManyScreens: Story = {
  args: {
    screens: Array.from({ length: 10 }, (_, i) => ({
      id: `screen-${i}`,
      campaignId: 'camp-1',
      name: `Screen ${i + 1} — ${['Initiative', 'NPCs', 'Locations', 'Items', 'Quests', 'Encounters', 'Maps', 'Rules', 'Session Log', 'Misc'][i]}`,
      tabOrder: i,
      createdBy: 'u-1',
      createdAt: '',
      updatedAt: '',
    })),
    activeScreenId: 'screen-0',
  },
}
