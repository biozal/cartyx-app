import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SectionHeader } from '~/components/SectionHeader'

describe('SectionHeader', () => {
  it('renders children', () => {
    render(<SectionHeader>THE QUEST</SectionHeader>)
    expect(screen.getByText('THE QUEST')).toBeInTheDocument()
  })

  it('uses font-pixel class', () => {
    render(<SectionHeader>TITLE</SectionHeader>)
    expect(screen.getByText('TITLE').className).toMatch(/font-pixel/)
  })

  it('applies sm size class', () => {
    render(<SectionHeader size="sm">TITLE</SectionHeader>)
    expect(screen.getByText('TITLE').className).toMatch(/text-\[9px\]/)
  })

  it('applies md size class by default', () => {
    render(<SectionHeader>TITLE</SectionHeader>)
    expect(screen.getByText('TITLE').className).toMatch(/text-\[11px\]/)
  })

  it('applies lg size class', () => {
    render(<SectionHeader size="lg">TITLE</SectionHeader>)
    expect(screen.getByText('TITLE').className).toMatch(/text-\[14px\]/)
  })

  it('applies blue color by default', () => {
    render(<SectionHeader>TITLE</SectionHeader>)
    expect(screen.getByText('TITLE').className).toMatch(/text-blue-400/)
  })

  it('applies white color', () => {
    render(<SectionHeader color="white">TITLE</SectionHeader>)
    expect(screen.getByText('TITLE').className).toMatch(/text-white/)
  })

  it('applies muted color', () => {
    render(<SectionHeader color="muted">TITLE</SectionHeader>)
    expect(screen.getByText('TITLE').className).toMatch(/text-slate-500/)
  })

  it('applies custom tracking class', () => {
    render(<SectionHeader tracking="tracking-[3px]">TITLE</SectionHeader>)
    expect(screen.getByText('TITLE').className).toMatch(/tracking-\[3px\]/)
  })

  it('applies custom className', () => {
    render(<SectionHeader className="mb-7">TITLE</SectionHeader>)
    expect(screen.getByText('TITLE').className).toMatch(/mb-7/)
  })
})
