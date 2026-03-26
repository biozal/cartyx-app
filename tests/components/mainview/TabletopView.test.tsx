import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TabletopView } from '~/components/mainview/TabletopView'

describe('TabletopView', () => {
  it('renders the Tabletop text', () => {
    render(<TabletopView />)

    expect(screen.getByText('Tabletop')).toBeInTheDocument()
  })

  it('renders the Coming Soon text', () => {
    render(<TabletopView />)

    expect(screen.getByText('Coming Soon')).toBeInTheDocument()
  })

  it('has the correct test id', () => {
    render(<TabletopView />)

    expect(screen.getByTestId('tabletop-view')).toBeInTheDocument()
  })
})
