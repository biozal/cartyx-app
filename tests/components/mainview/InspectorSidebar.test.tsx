import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InspectorSidebar } from '~/components/mainview/InspectorSidebar'

describe('InspectorSidebar', () => {
  it('defaults to the chat tab', () => {
    render(<InspectorSidebar />)
    expect(screen.getByTestId('inspector-panel')).toHaveTextContent('Chat — Coming Soon')
  })

  it('renders all 4 tab buttons', () => {
    render(<InspectorSidebar />)
    expect(screen.getByTestId('inspector-tab-chat')).toBeInTheDocument()
    expect(screen.getByTestId('inspector-tab-wiki')).toBeInTheDocument()
    expect(screen.getByTestId('inspector-tab-notepad')).toBeInTheDocument()
    expect(screen.getByTestId('inspector-tab-settings')).toBeInTheDocument()
  })

  it('switches to wiki panel when wiki tab is clicked', async () => {
    const user = userEvent.setup()
    render(<InspectorSidebar />)
    await user.click(screen.getByTestId('inspector-tab-wiki'))
    expect(screen.getByTestId('inspector-panel')).toHaveTextContent('Wiki — Coming Soon')
  })

  it('switches to notepad panel when notepad tab is clicked', async () => {
    const user = userEvent.setup()
    render(<InspectorSidebar />)
    await user.click(screen.getByTestId('inspector-tab-notepad'))
    expect(screen.getByTestId('inspector-panel')).toHaveTextContent('Notepad — Coming Soon')
  })

  it('switches to settings panel when settings tab is clicked', async () => {
    const user = userEvent.setup()
    render(<InspectorSidebar />)
    await user.click(screen.getByTestId('inspector-tab-settings'))
    expect(screen.getByTestId('inspector-panel')).toHaveTextContent('Settings — Coming Soon')
  })

  it('respects defaultTab prop', () => {
    render(<InspectorSidebar defaultTab="notepad" />)
    expect(screen.getByTestId('inspector-panel')).toHaveTextContent('Notepad — Coming Soon')
  })

  it('active tab has active styling class', () => {
    render(<InspectorSidebar defaultTab="chat" />)
    expect(screen.getByTestId('inspector-tab-chat')).toHaveClass('text-[#60A5FA]')
    expect(screen.getByTestId('inspector-tab-wiki')).toHaveClass('text-slate-500')
  })
})
