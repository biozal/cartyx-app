import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InspectorSidebar } from '~/components/mainview/InspectorSidebar'

describe('InspectorSidebar', () => {
  it('defaults to the chat tab', () => {
    render(<InspectorSidebar />)
    expect(screen.getByTestId('inspector-panel')).toContainElement(
      screen.getByRole('combobox', { name: 'Session selector' })
    )
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
    expect(screen.getByTestId('inspector-panel')).toContainElement(
      screen.getByTestId('notepad-panel')
    )
    expect(screen.getByRole('heading', { name: 'Notepad' })).toBeInTheDocument()
    expect(screen.getByTestId('notepad-panel')).toHaveTextContent('Coming Soon')
  })

  it('switches to settings panel when settings tab is clicked', async () => {
    const user = userEvent.setup()
    render(<InspectorSidebar />)
    await user.click(screen.getByTestId('inspector-tab-settings'))
    expect(screen.getByTestId('inspector-panel')).toHaveTextContent('Settings — Coming Soon')
  })

  it('respects defaultTab prop', () => {
    render(<InspectorSidebar defaultTab="notepad" />)
    expect(screen.getByTestId('inspector-panel')).toContainElement(
      screen.getByTestId('notepad-panel')
    )
  })

  it('active tab has aria-selected=true', () => {
    render(<InspectorSidebar defaultTab="chat" />)
    expect(screen.getByTestId('inspector-tab-chat')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('inspector-tab-wiki')).toHaveAttribute('aria-selected', 'false')
  })

  it('only active tab is tabbable (roving tabindex)', () => {
    render(<InspectorSidebar defaultTab="chat" />)
    expect(screen.getByTestId('inspector-tab-chat')).toHaveAttribute('tabindex', '0')
    expect(screen.getByTestId('inspector-tab-wiki')).toHaveAttribute('tabindex', '-1')
  })

  it('has proper tablist role', () => {
    render(<InspectorSidebar />)
    expect(screen.getByRole('tablist', { name: 'Inspector panels' })).toBeInTheDocument()
  })

  it('arrow keys navigate between tabs', () => {
    render(<InspectorSidebar defaultTab="chat" />)
    const chatTab = screen.getByTestId('inspector-tab-chat')
    fireEvent.keyDown(chatTab, { key: 'ArrowRight' })
    expect(screen.getByTestId('inspector-panel')).toHaveTextContent('Wiki — Coming Soon')
  })

  it('tab buttons have type=button', () => {
    render(<InspectorSidebar />)
    const buttons = screen.getAllByRole('tab')
    buttons.forEach(btn => {
      expect(btn).toHaveAttribute('type', 'button')
    })
  })
})
