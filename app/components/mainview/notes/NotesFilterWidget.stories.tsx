import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { useState } from 'react'
import { NotesFilterWidget } from './NotesFilterWidget'
import { mockSessions } from '~/services/mocks/sessionsService'

const meta: Meta<typeof NotesFilterWidget> = {
  title: 'Components/MainView/Notes/NotesFilterWidget',
  component: NotesFilterWidget,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-sm bg-[#080A12]">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

function Controlled(args: ComponentProps<typeof NotesFilterWidget>) {
  const [search, setSearch] = useState(args.search)
  const [sessionId, setSessionId] = useState(args.sessionId)
  const [visibility, setVisibility] = useState(args.visibility)

  return (
    <NotesFilterWidget
      {...args}
      search={search}
      onSearchChange={setSearch}
      sessionId={sessionId}
      onSessionChange={setSessionId}
      visibility={visibility}
      onVisibilityChange={setVisibility}
    />
  )
}

export const Default: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    search: '',
    sessionId: '',
    visibility: 'all',
    sessions: [...mockSessions],
    onSearchChange: () => {},
    onSessionChange: () => {},
    onVisibilityChange: () => {},
    onCreateClick: () => {},
  },
}

export const WithSearchText: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    ...Default.args,
    search: 'traitor',
  },
}

export const FilteredBySession: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    ...Default.args,
    sessionId: 'session-14',
  },
}

export const PrivateOnly: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    ...Default.args,
    visibility: 'private',
  },
}

export const NoSessions: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    ...Default.args,
    sessions: [],
  },
}
