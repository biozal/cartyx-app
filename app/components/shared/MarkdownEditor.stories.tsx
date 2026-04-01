import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { useState } from 'react'
import { MarkdownEditor } from './MarkdownEditor'

const meta: Meta<typeof MarkdownEditor> = {
  title: 'Components/Shared/MarkdownEditor',
  component: MarkdownEditor,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-2xl bg-[#080A12] p-6">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

function Controlled(args: ComponentProps<typeof MarkdownEditor>) {
  const [value, setValue] = useState(args.value)
  return <MarkdownEditor {...args} value={value} onChange={setValue} />
}

export const Default: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    value: '',
    onChange: () => {},
    label: 'Note',
    placeholder: 'Write your markdown here...',
  },
}

const sampleMarkdown = `# Session Recap

The party ventured into the **Emberfall Chapel** and discovered a hidden sanctum beneath the altar.

## Key Events

- The bell tolled twice, opening the sealed door
- A spectral guardian challenged the party
- The rogue disarmed the trap on the inner vault

## Loot Found

| Item | Rarity | Claimed By |
|------|--------|------------|
| Amulet of Warding | Rare | Cleric |
| Shadow Blade | Uncommon | Rogue |

> "The dead do not forgive trespass." — The Guardian

\`\`\`
Ancient runes translated:
FIRE CONSUMES THE FALSE HEIR
\`\`\``

export const WithContent: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    ...Default.args,
    value: sampleMarkdown,
  },
}

export const PreviewMode: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    ...Default.args,
    value: sampleMarkdown,
    defaultMode: 'preview',
  },
}

export const WithError: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    ...Default.args,
    value: '',
    error: 'Note body is required',
  },
}

export const WithHint: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    ...Default.args,
    value: '',
    hint: 'Supports GitHub-flavored markdown including tables and task lists.',
  },
}

export const Disabled: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    ...Default.args,
    value: sampleMarkdown,
    disabled: true,
  },
}

export const CustomHeight: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    ...Default.args,
    value: '',
    minHeight: '24rem',
    placeholder: 'Taller editor area for longer notes...',
  },
}

export const NoLabel: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    ...Default.args,
    label: undefined,
  },
}
