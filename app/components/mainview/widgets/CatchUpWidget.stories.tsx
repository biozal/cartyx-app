import type { Meta, StoryObj } from '@storybook/react-vite';
import { DashboardView } from '~/components/mainview/DashboardView';
import { Widget } from '~/components/mainview/Widget';
import { CatchUpWidget } from './CatchUpWidget';

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
};
export default meta;
type Story = StoryObj<typeof meta>;

const mockCatchUp = `## Session 14 — The Shattered Vault

The party descended into the **Sunken District** after following the trail of corrupted ward-stones.

### Key Events
- Mira triggered a shadow-glyph trap near the east archway
- The party discovered a sealed vault beneath the Scriptorium

### Party Status

| Character | HP | Conditions |
|-----------|-----|------------|
| Theron | 24/40 | Exhausted (1) |
| Mira | 31/31 | — |`;

export const Default: Story = {
  args: {
    catchUp: mockCatchUp,
  },
};

export const Empty: Story = {
  args: {
    catchUp: null,
  },
};

export const Loading: Story = {
  args: {
    catchUp: undefined,
  },
};

export const InDashboardGrid: Story = {
  render: () => (
    <div className="min-h-screen bg-[#080A12]">
      <DashboardView>
        <CatchUpWidget catchUp={mockCatchUp} />

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
};
