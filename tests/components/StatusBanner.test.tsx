import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StatusBanner } from '~/components/StatusBanner'

describe('StatusBanner', () => {
  it('renders the message', () => {
    render(<StatusBanner variant="error" message="Something went wrong." />)
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument()
  })

  it('has role="alert"', () => {
    render(<StatusBanner variant="info" message="Info message." />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('applies error styles for error variant', () => {
    render(<StatusBanner variant="error" message="Error." />)
    expect(screen.getByRole('alert').className).toMatch(/red/)
  })

  it('applies warning styles for warning variant', () => {
    render(<StatusBanner variant="warning" message="Warning." />)
    expect(screen.getByRole('alert').className).toMatch(/yellow/)
  })

  it('applies info styles for info variant', () => {
    render(<StatusBanner variant="info" message="Info." />)
    expect(screen.getByRole('alert').className).toMatch(/blue/)
  })

  it('applies success styles for success variant', () => {
    render(<StatusBanner variant="success" message="Success." />)
    expect(screen.getByRole('alert').className).toMatch(/green/)
  })

  it('does not render dismiss button when dismissible is false', () => {
    render(<StatusBanner variant="info" message="Info." />)
    expect(screen.queryByLabelText('Dismiss')).not.toBeInTheDocument()
  })

  it('renders dismiss button when dismissible=true and onDismiss is provided', () => {
    render(<StatusBanner variant="info" message="Info." dismissible onDismiss={vi.fn()} />)
    expect(screen.getByLabelText('Dismiss')).toBeInTheDocument()
  })

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn()
    render(<StatusBanner variant="info" message="Info." dismissible onDismiss={onDismiss} />)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
