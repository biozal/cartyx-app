import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CatchUpWidget } from '~/components/mainview/widgets/CatchUpWidget'
import { mockCatchUpContent } from '~/services/mocks/catchUpService'

describe('CatchUpWidget', () => {
  it('renders the widget title', () => {
    render(<CatchUpWidget content={mockCatchUpContent} />)
    expect(screen.getByText('Session Catch-Up')).toBeInTheDocument()
  })

  it('renders markdown content as HTML', async () => {
    render(<CatchUpWidget content={mockCatchUpContent} />)
    // h1 in markdown is remapped to h3 to avoid heading hierarchy issues
    const heading = await screen.findByRole('heading', { name: /Session 14/ })
    expect(heading).toBeInTheDocument()
    expect(heading.tagName).toBe('H3')
  })

  it('renders GFM table from markdown', async () => {
    render(<CatchUpWidget content={mockCatchUpContent} />)
    // The party status table should render as an HTML table
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(await screen.findByRole('columnheader', { name: 'Character' })).toBeInTheDocument()
    expect(await screen.findByRole('columnheader', { name: 'HP' })).toBeInTheDocument()
  })

  it('scrollable container has max-h-[400px] class', () => {
    render(<CatchUpWidget content={mockCatchUpContent} />)
    const scrollContainer = screen.getByTestId('catchup-scroll')
    expect(scrollContainer).toHaveClass('max-h-[400px]')
    expect(scrollContainer).toHaveClass('overflow-y-auto')
  })

  it('applies col-span-full for full-width layout', () => {
    const { container } = render(<CatchUpWidget content={mockCatchUpContent} />)
    const section = container.querySelector('section')
    expect(section).not.toBeNull()
    expect(section!).toHaveClass('col-span-full')
  })

  it('renders markdown content area', () => {
    render(<CatchUpWidget content={mockCatchUpContent} />)
    const markdownDiv = screen.getByTestId('catchup-markdown')
    expect(markdownDiv).toBeInTheDocument()
    // Should contain prose classes for markdown styling
    expect(markdownDiv).toHaveClass('prose')
    expect(markdownDiv).toHaveClass('prose-invert')
    expect(screen.getByText(/Where We Left Off/)).toBeInTheDocument()
  })
})
