import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CampaignHeroBanner } from '~/components/campaign/CampaignHeroBanner'

describe('CampaignHeroBanner', () => {
  it('renders campaign name', () => {
    render(<CampaignHeroBanner name="The Lost Mines" imagePath={null} status="active" />)
    expect(screen.getByText('The Lost Mines')).toBeInTheDocument()
  })

  it('renders ACTIVE badge for active status', () => {
    render(<CampaignHeroBanner name="Test" imagePath={null} status="active" />)
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
  })

  it('renders PAUSED badge for paused status', () => {
    render(<CampaignHeroBanner name="Test" imagePath={null} status="paused" />)
    expect(screen.getByText('PAUSED')).toBeInTheDocument()
  })

  it('renders an img element when imagePath is a valid upload path', () => {
    const { container } = render(
      <CampaignHeroBanner name="Test" imagePath="/uploads/campaigns/img.jpg" status="active" />
    )
    expect(container.querySelector('img')).toBeInTheDocument()
  })

  it('does not render an img when imagePath is null', () => {
    const { container } = render(<CampaignHeroBanner name="Test" imagePath={null} status="active" />)
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  it('does not render an img for an untrusted imagePath', () => {
    const { container } = render(
      <CampaignHeroBanner name="Test" imagePath="https://evil.com/img.jpg" status="active" />
    )
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })
})
