import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatPanel } from '~/components/mainview/ChatPanel'

describe('ChatPanel', () => {
  it('renders session selector', () => {
    render(<ChatPanel />)

    expect(screen.getByRole('combobox', { name: 'Session selector' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Session 14' })).toBeInTheDocument()
  })

  it('renders General and GM tabs', () => {
    render(<ChatPanel />)

    expect(screen.getByRole('tab', { name: 'General' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'GM' })).toBeInTheDocument()
  })

  it('marks General tab active by default', () => {
    render(<ChatPanel />)

    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'GM' })).toHaveAttribute('aria-selected', 'false')
  })

  it('clicking GM tab makes it active', async () => {
    const user = userEvent.setup()
    render(<ChatPanel />)

    await user.click(screen.getByRole('tab', { name: 'GM' }))

    expect(screen.getByRole('tab', { name: 'GM' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'false')
  })

  it('renders Coming Soon placeholder in active panel', () => {
    render(<ChatPanel />)

    // Both panels render "Coming Soon" but only the active one is visible
    const placeholders = screen.getAllByText('Coming Soon')
    expect(placeholders.length).toBeGreaterThan(0)
    // The visible one is inside the non-hidden panel
    const visiblePanel = screen.getByRole('tabpanel')
    expect(visiblePanel).toHaveTextContent('Coming Soon')
  })

  it('renders message input and send button', () => {
    render(<ChatPanel />)

    expect(screen.getByRole('textbox', { name: 'Message input' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument()
  })

  it('ArrowRight moves focus from General to GM tab', async () => {
    const user = userEvent.setup()
    render(<ChatPanel />)

    const generalTab = screen.getByRole('tab', { name: 'General' })
    generalTab.focus()
    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('tab', { name: 'GM' })).toHaveAttribute('aria-selected', 'true')
  })

  it('ArrowLeft wraps from General to GM tab', async () => {
    const user = userEvent.setup()
    render(<ChatPanel />)

    const generalTab = screen.getByRole('tab', { name: 'General' })
    generalTab.focus()
    await user.keyboard('{ArrowLeft}')

    expect(screen.getByRole('tab', { name: 'GM' })).toHaveAttribute('aria-selected', 'true')
  })

  it('all tabpanels are in the DOM (hidden attribute toggles visibility)', () => {
    render(<ChatPanel />)

    const panels = screen.getAllByRole('tabpanel', { hidden: true })
    expect(panels).toHaveLength(2)
  })

  it('inactive tabpanel has hidden attribute', () => {
    const { container } = render(<ChatPanel />)

    // Two panels rendered; the one with hidden attribute is the inactive one
    const allPanels = container.querySelectorAll('[role="tabpanel"]')
    expect(allPanels).toHaveLength(2)
    const hiddenPanel = Array.from(allPanels).find(p => p.hasAttribute('hidden'))
    expect(hiddenPanel).toBeDefined()
  })
})
