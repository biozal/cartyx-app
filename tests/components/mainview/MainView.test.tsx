import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MainView } from '~/components/mainview/MainView'

describe('MainView', () => {
  it('renders children', () => {
    render(
      <MainView>
        <div>Test Content</div>
      </MainView>
    )
    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('hides toolbar by default', () => {
    render(
      <MainView>
        <div>Content</div>
      </MainView>
    )
    const toolbar = screen.getByTestId('mainview-toolbar')
    expect(toolbar).toHaveClass('w-0')
    expect(toolbar).not.toHaveClass('w-14')
  })

  it('shows toolbar when showToolbar is true', () => {
    render(
      <MainView showToolbar>
        <div>Content</div>
      </MainView>
    )
    const toolbar = screen.getByTestId('mainview-toolbar')
    expect(toolbar).toHaveClass('w-14')
    expect(toolbar).not.toHaveClass('w-0')
  })

  it('shows inspector by default', () => {
    render(
      <MainView>
        <div>Content</div>
      </MainView>
    )
    const inspector = screen.getByTestId('mainview-inspector')
    expect(inspector).toHaveClass('w-80')
    expect(inspector).not.toHaveClass('w-0')
  })

  it('hides inspector when showInspector is false', () => {
    render(
      <MainView showInspector={false}>
        <div>Content</div>
      </MainView>
    )
    const inspector = screen.getByTestId('mainview-inspector')
    expect(inspector).toHaveClass('w-0')
    expect(inspector).not.toHaveClass('w-80')
  })

  it('hides both sidebars when both props are false', () => {
    render(
      <MainView showToolbar={false} showInspector={false}>
        <div>Content</div>
      </MainView>
    )
    expect(screen.getByTestId('mainview-toolbar')).toHaveClass('w-0')
    expect(screen.getByTestId('mainview-inspector')).toHaveClass('w-0')
  })
})
