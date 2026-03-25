import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FormSelect } from '~/components/FormSelect'

const options = [
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
]

describe('FormSelect', () => {
  it('renders a select element', () => {
    render(<FormSelect value="America/Chicago" onChange={vi.fn()} options={options} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('renders the label when provided', () => {
    render(<FormSelect label="Timezone" value="America/Chicago" onChange={vi.fn()} options={options} />)
    expect(screen.getByText('Timezone')).toBeInTheDocument()
  })

  it('applies additional classes to the label', () => {
    render(<FormSelect label="Timezone" labelClassName="uppercase" value="America/Chicago" onChange={vi.fn()} options={options} />)
    expect(screen.getByText('Timezone').className).toMatch(/uppercase/)
  })

  it('renders all options', () => {
    render(<FormSelect value="America/Chicago" onChange={vi.fn()} options={options} />)
    expect(screen.getByText('Central Time (CT)')).toBeInTheDocument()
    expect(screen.getByText('Eastern Time (ET)')).toBeInTheDocument()
  })

  it('selects the correct option by value', () => {
    render(<FormSelect value="America/New_York" onChange={vi.fn()} options={options} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('America/New_York')
  })

  it('disables the select when disabled=true', () => {
    render(<FormSelect value="America/Chicago" onChange={vi.fn()} options={options} disabled />)
    expect(screen.getByRole('combobox')).toBeDisabled()
  })
})
