import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SettingsPanel } from '~/components/mainview/SettingsPanel'

describe('SettingsPanel', () => {
  it('renders the Settings heading', () => {
    render(<SettingsPanel />)

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  })

  it('renders the Coming Soon placeholder', () => {
    render(<SettingsPanel />)

    expect(screen.getByText('Coming Soon')).toBeInTheDocument()
  })

  it('has the correct test id', () => {
    render(<SettingsPanel />)

    expect(screen.getByTestId('settings-panel')).toBeInTheDocument()
  })
})
