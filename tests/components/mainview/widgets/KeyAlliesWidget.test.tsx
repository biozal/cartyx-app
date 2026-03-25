import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KeyAlliesWidget } from '~/components/mainview/widgets/KeyAlliesWidget'

describe('KeyAlliesWidget', () => {
  it('renders the widget title', () => {
    render(<KeyAlliesWidget allies={[]} />)

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

  it('renders the empty state when allies is empty', () => {
    render(<KeyAlliesWidget allies={[]} />)

    expect(screen.getByText('No allies found')).toBeInTheDocument()
  })

  it('renders initials fallback when no avatarUrl', () => {
    render(<KeyAlliesWidget allies={[{ id: 'a1', name: 'Elder Morvain', location: 'Thornhollow' }]} />)
    // "Elder Morvain" → initials "EM"
    expect(screen.getByText('EM')).toBeInTheDocument()
  })

  it('renders img when avatarUrl is provided', () => {
    render(<KeyAlliesWidget allies={[{ id: 'a1', name: 'Elder Morvain', location: 'Thornhollow', avatarUrl: 'https://example.com/avatar.jpg' }]} />)
    const img = screen.getByRole('img', { name: 'Elder Morvain' })
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg')
  })
})
