import type { Meta, StoryObj } from '@storybook/react-vite'
import { StackCard } from './StackCard'
import type { StackData, HydratedDocument } from '~/server/functions/gmscreens'

const mockStack: StackData = {
  id: 'st-1',
  name: 'Initiative Order',
  x: null,
  y: null,
  items: [
    { id: 'si-1', collection: 'note', documentId: 'doc-1', label: 'Aster Vane' },
    { id: 'si-2', collection: 'note', documentId: 'doc-2', label: 'Ser Caldus' },
    { id: 'si-3', collection: 'note', documentId: 'doc-3', label: 'Goblin Skirmisher' },
  ],
}

const mockHydrated: Record<string, HydratedDocument> = {
  'note:doc-1': { id: 'doc-1', collection: 'note', title: 'Aster Vane — HP 32/45' },
  'note:doc-2': { id: 'doc-2', collection: 'note', title: 'Ser Caldus — HP 58/58' },
  'note:doc-3': { id: 'doc-3', collection: 'note', title: 'Goblin Skirmisher — HP 12/12' },
}

const meta: Meta<typeof StackCard> = {
  title: 'Components/MainView/GMScreens/StackCard',
  component: StackCard,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="flex items-start justify-center bg-[#080A12] p-8 min-h-[300px]">
        <Story />
      </div>
    ),
  ],
  args: {
    stack: mockStack,
    hydrated: mockHydrated,
    onRename: () => {},
    onDelete: () => {},
    onMove: () => {},
    onRemoveItem: () => {},
    onOpenItem: () => {},
  },
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const EmptyStack: Story = {
  args: {
    stack: { ...mockStack, items: [] },
    hydrated: {},
  },
}

export const ManyItems: Story = {
  args: {
    stack: {
      ...mockStack,
      name: 'Party Inventory',
      items: Array.from({ length: 12 }, (_, i) => ({
        id: `si-${i}`,
        collection: 'note',
        documentId: `doc-${i}`,
        label: `Item ${i + 1}`,
      })),
    },
    hydrated: Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [
        `note:doc-${i}`,
        { id: `doc-${i}`, collection: 'note', title: `Magic Item #${i + 1}` },
      ])
    ),
  },
}
