import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FloatingWindowTray } from '~/components/mainview/FloatingWindowTray'

describe('FloatingWindowTray', () => {
  it('renders minimized window titles', () => {
    render(
      <div className="relative h-[600px] w-[800px]">
        <FloatingWindowTray
          windows={[
            { id: 'wiki', title: 'Wiki Entry' },
            { id: 'sheet', title: 'Character Sheet' },
          ]}
          onRestore={vi.fn()}
        />
      </div>,
    )

    expect(screen.getByRole('button', { name: 'Wiki Entry' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Character Sheet' })).toBeInTheDocument()
  })

  it('clicking a tray item calls onRestore with the correct id', async () => {
    const user = userEvent.setup()
    const onRestore = vi.fn()

    render(
      <div className="relative h-[600px] w-[800px]">
        <FloatingWindowTray windows={[{ id: 'wiki', title: 'Wiki Entry' }]} onRestore={onRestore} />
      </div>,
    )

    await user.click(screen.getByRole('button', { name: 'Wiki Entry' }))

    expect(onRestore).toHaveBeenCalledWith('wiki')
  })

  it('empty tray renders nothing', () => {
    const { container } = render(
      <div className="relative h-[600px] w-[800px]">
        <FloatingWindowTray windows={[]} onRestore={vi.fn()} />
      </div>,
    )

    expect(container.querySelector('button')).not.toBeInTheDocument()
  })
})
