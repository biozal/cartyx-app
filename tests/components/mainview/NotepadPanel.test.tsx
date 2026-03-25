import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NotepadPanel } from '~/components/mainview/NotepadPanel'

describe('NotepadPanel', () => {
  it('renders the Notepad heading', () => {
    render(<NotepadPanel />)

    expect(screen.getByRole('heading', { name: 'Notepad' })).toBeInTheDocument()
  })

  it('renders the Coming Soon placeholder', () => {
    render(<NotepadPanel />)

    expect(screen.getByText('Coming Soon')).toBeInTheDocument()
  })

  it('has the correct test id', () => {
    render(<NotepadPanel />)

    expect(screen.getByTestId('notepad-panel')).toBeInTheDocument()
  })
})
