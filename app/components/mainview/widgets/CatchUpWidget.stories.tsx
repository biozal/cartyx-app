import type { Meta, StoryObj } from '@storybook/react-vite'
import { DashboardView } from '~/components/mainview/DashboardView'
import { Widget } from '~/components/mainview/Widget'
import { CatchUpWidget } from './CatchUpWidget'

const meta: Meta<typeof CatchUpWidget> = {
  title: 'Components/Widgets/CatchUpWidget',
  component: CatchUpWidget,
  tags: ['autodocs'],
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

export const Default: Story = {}

export const InDashboardGrid: Story = {
  render: () => (
    <div className="min-h-screen bg-[#080A12]">
      <DashboardView>
        <CatchUpWidget />

        <Widget title="Threat Monitor">
          <div className="space-y-2 font-sans font-semibold text-xs text-slate-400">
            <p>Watchtower wards: unstable</p>
            <p>Corruption spread: 38%</p>
          </div>
        </Widget>

        <Widget title="Supply Ledger">
          <div className="space-y-2 font-sans font-semibold text-xs text-slate-400">
            <p>Rations: 6</p>
            <p>Potions: 2</p>
          </div>
        </Widget>
      </DashboardView>
    </div>
  ),
}
