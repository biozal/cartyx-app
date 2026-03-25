import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CatchUpWidget } from '~/components/mainview/widgets/CatchUpWidget'

describe('CatchUpWidget', () => {
  it('renders the widget title', () => {
    render(<CatchUpWidget />)
    expect(screen.getByText('Session Catch-Up')).toBeInTheDocument()
  })

  it('renders markdown content as HTML', () => {
    render(<CatchUpWidget />)
    // The markdown heading "# Session 14 — The Shattered Vault" should render as an <h1>
    const heading = screen.getByRole('heading', { name: /Session 14/ })
    expect(heading).toBeInTheDocument()
  })

  it('renders GFM table from markdown', () => {
    render(<CatchUpWidget />)
    // The party status table should render as an HTML table
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Character' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'HP' })).toBeInTheDocument()
  })

  it('scrollable container has max-h-[400px] class', () => {
    render(<CatchUpWidget />)
    const scrollContainer = screen.getByTestId('catchup-scroll')
    expect(scrollContainer).toHaveClass('max-h-[400px]')
    expect(scrollContainer).toHaveClass('overflow-y-auto')
  })

  it('applies col-span-full for full-width layout', () => {
    const { container } = render(<CatchUpWidget />)
    // The Widget renders a <section> as its root element
    const section = container.querySelector('section')
    expect(section).toHaveClass('col-span-full')
  })

  it('renders markdown content area', () => {
    render(<CatchUpWidget />)
    const markdownDiv = screen.getByTestId('catchup-markdown')
    expect(markdownDiv).toBeInTheDocument()
    // Should contain prose classes for markdown styling
    expect(markdownDiv).toHaveClass('prose')
    expect(markdownDiv).toHaveClass('prose-invert')
  })
})
