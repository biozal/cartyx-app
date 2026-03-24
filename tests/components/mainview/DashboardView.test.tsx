import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DashboardView } from '~/components/mainview/DashboardView'

describe('DashboardView', () => {
  it('renders the grid when widgets are provided', () => {
    render(
      <DashboardView
        widgets={[
          { title: 'Widget One', content: <div>One</div> },
          { title: 'Widget Two', content: <div>Two</div> },
        ]}
      />
    )

    expect(screen.getByTestId('dashboard-grid')).toBeInTheDocument()
    expect(screen.getByText('Widget One')).toBeInTheDocument()
    expect(screen.getByText('Widget Two')).toBeInTheDocument()
  })

  it('renders the empty state when no widgets are present', () => {
    render(<DashboardView />)

    expect(screen.getByText('No widgets yet')).toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-grid')).not.toBeInTheDocument()
  })

  it('renders children when provided', () => {
    render(
      <DashboardView>
        <div>Custom Widget Content</div>
      </DashboardView>
    )

    expect(screen.getByTestId('dashboard-grid')).toBeInTheDocument()
    expect(screen.getByText('Custom Widget Content')).toBeInTheDocument()
  })
})
