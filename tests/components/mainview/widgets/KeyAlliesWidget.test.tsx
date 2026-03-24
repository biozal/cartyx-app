import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KeyAlliesWidget } from '~/components/mainview/widgets/KeyAlliesWidget'

describe('KeyAlliesWidget', () => {
  it('renders the widget title', () => {
    render(<KeyAlliesWidget />)

    expect(screen.getByText('Key Allies')).toBeInTheDocument()
  })

  it('renders all ally names and locations', () => {
    const allies = [
      { id: 'ally-1', name: 'Elder Morvain', location: 'Thornhollow' },
      { id: 'ally-2', name: 'Mira Quickstep', location: 'Goldmeadow' },
    ]

    render(<KeyAlliesWidget allies={allies} />)

    for (const ally of allies) {
      expect(screen.getByText(ally.name)).toBeInTheDocument()
      expect(screen.getByText(ally.location)).toBeInTheDocument()
    }
  })

  it('renders the empty state when no allies are provided', () => {
    render(<KeyAlliesWidget allies={[]} />)

    expect(screen.getByText('No allies found')).toBeInTheDocument()
  })
})
