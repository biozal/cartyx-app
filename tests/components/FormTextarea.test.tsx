import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FormTextarea } from '~/components/FormTextarea'

describe('FormTextarea', () => {
  it('renders a textarea element', () => {
    render(<FormTextarea value="" onChange={vi.fn()} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders the label when provided', () => {
    render(<FormTextarea label="Description" value="" onChange={vi.fn()} />)
    expect(screen.getByText('Description')).toBeInTheDocument()
  })

  it('applies additional classes to the label', () => {
    render(<FormTextarea label="Description" labelClassName="uppercase" value="" onChange={vi.fn()} />)
    expect(screen.getByText('Description').className).toMatch(/uppercase/)
  })

  it('renders error message', () => {
    render(<FormTextarea value="" onChange={vi.fn()} error="Too long." />)
    expect(screen.getByText('Too long.')).toBeInTheDocument()
  })

  it('shows character count when maxLength is provided', () => {
    render(<FormTextarea value="hello" onChange={vi.fn()} maxLength={500} />)
    expect(screen.getByText('5/500')).toBeInTheDocument()
  })

  it('does not show character count when maxLength is omitted', () => {
    render(<FormTextarea value="hello" onChange={vi.fn()} />)
    expect(screen.queryByText(/\/\d+/)).not.toBeInTheDocument()
  })

  it('hides character count when error is shown', () => {
    render(<FormTextarea value="hello" onChange={vi.fn()} maxLength={500} error="Too long." />)
    expect(screen.queryByText('5/500')).not.toBeInTheDocument()
    expect(screen.getByText('Too long.')).toBeInTheDocument()
  })

  it('disables the textarea when disabled=true', () => {
    render(<FormTextarea value="" onChange={vi.fn()} disabled />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('applies amber color when near the character limit', () => {
    const longValue = 'a'.repeat(460)
    render(<FormTextarea value={longValue} onChange={vi.fn()} maxLength={500} />)
    const counter = screen.getByText('460/500')
    expect(counter.className).toMatch(/amber/)
  })
})
