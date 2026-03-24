import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CampaignDescription } from '~/components/campaign/CampaignDescription'

describe('CampaignDescription', () => {
  it('renders description text', () => {
    render(<CampaignDescription description="A classic D&D adventure." />)
    expect(screen.getByText('A classic D&D adventure.')).toBeInTheDocument()
  })

  it('renders nothing when description is empty', () => {
    const { container } = render(<CampaignDescription description="" />)
    expect(container.firstChild).toBeNull()
  })
})
