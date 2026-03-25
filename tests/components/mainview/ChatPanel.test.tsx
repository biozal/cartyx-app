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

  it('renders Coming Soon placeholder', () => {
    render(<ChatPanel />)

    expect(screen.getByText('Coming Soon')).toBeInTheDocument()
  })

  it('renders message input and send button', () => {
    render(<ChatPanel />)

    expect(screen.getByRole('textbox', { name: 'Message input' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument()
  })
})
