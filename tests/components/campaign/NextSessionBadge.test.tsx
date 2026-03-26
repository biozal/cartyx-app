import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('~/utils/date', () => ({
  formatNextSession: vi.fn(() => 'Friday · 7:00 PM (in 3 days)'),
}))

import { NextSessionBadge } from '~/components/campaign/NextSessionBadge'

describe('NextSessionBadge', () => {
  it('renders formatted next session when scheduled', () => {
    render(
      <NextSessionBadge
        nextSession={{ day: 'Friday', time: '19:00' }}
        schedule={{ time: '19:00', timezone: 'America/Chicago' }}
      />
    )
    expect(screen.getByText('Friday · 7:00 PM (in 3 days)')).toBeInTheDocument()
    expect(screen.getByText('NEXT SESSION')).toBeInTheDocument()
  })

  it('renders "Not scheduled" when nextSession is null', () => {
    render(
      <NextSessionBadge
        nextSession={null}
        schedule={{ time: null, timezone: null }}
      />
    )
    expect(screen.getByText('Not scheduled')).toBeInTheDocument()
  })
})
