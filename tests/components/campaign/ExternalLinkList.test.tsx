import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExternalLinkList } from '~/components/campaign/ExternalLinkList'

describe('ExternalLinkList', () => {
  const links = [
    { name: 'Campaign Wiki', url: 'https://example.com/wiki' },
    { name: 'Shared Notes', url: 'https://notion.so/campaign' },
  ]

  it('renders all links', () => {
    render(<ExternalLinkList links={links} />)
    expect(screen.getByText('Campaign Wiki')).toBeInTheDocument()
    expect(screen.getByText('Shared Notes')).toBeInTheDocument()
  })

  it('renders LINKS label', () => {
    render(<ExternalLinkList links={links} />)
    expect(screen.getByText('LINKS')).toBeInTheDocument()
  })

  it('renders nothing when links is empty', () => {
    const { container } = render(<ExternalLinkList links={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders link anchors with correct hrefs', () => {
    render(<ExternalLinkList links={links} />)
    const anchors = screen.getAllByRole('link')
    expect(anchors[0]).toHaveAttribute('href', 'https://example.com/wiki')
    expect(anchors[1]).toHaveAttribute('href', 'https://notion.so/campaign')
  })
})
