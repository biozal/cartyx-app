import type { Meta, StoryObj } from '@storybook/react-vite'
import { DashboardView } from '../DashboardView'
import { WidgetSlot } from '../WidgetSlot'
import { PartyMembersWidget } from './PartyMembersWidget'
import { mockPartyMembers } from '~/services/mocks/partyMembersService'

const meta: Meta<typeof PartyMembersWidget> = {
  title: 'Components/MainView/Widgets/PartyMembersWidget',
  component: PartyMembersWidget,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-[#080A12] p-6">
        <Story />
      </div>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    members: mockPartyMembers,
  },
}

export const EmptyState: Story = {
  args: {
    members: [],
  },
}

export const InDashboardGrid: Story = {
  render: () => (
    <DashboardView>
      <PartyMembersWidget members={mockPartyMembers} />

      <WidgetSlot title="Quest Log">
        <div className="space-y-2 font-sans font-semibold text-xs text-slate-400">
          <p>Recover the stolen moonstone.</p>
          <p>Meet the ferryman at dusk.</p>
        </div>
      </WidgetSlot>

      <WidgetSlot title="Camp Supplies">
        <div className="space-y-2 font-sans font-semibold text-xs text-slate-400">
          <p>Bedrolls: 5</p>
          <p>Torches: 8</p>
          <p>Waterskins: 4</p>
        </div>
      </WidgetSlot>
    </DashboardView>
  ),
}
