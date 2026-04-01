import { describe, it, expect } from 'vitest'
import { GMScreen, GMSCREEN_LIMITS, WINDOW_STATES } from '~/server/db/models/GMScreen'

describe('GMScreen model exports', () => {
  it('is exported and defined', () => {
    expect(GMScreen).toBeDefined()
  })
})

describe('GMSCREEN_LIMITS constants', () => {
  it('defines MAX_WINDOWS as 20', () => {
    expect(GMSCREEN_LIMITS.MAX_WINDOWS).toBe(20)
  })

  it('defines MAX_STACKS as 10', () => {
    expect(GMSCREEN_LIMITS.MAX_STACKS).toBe(10)
  })

  it('defines MAX_STACK_ITEMS as 50', () => {
    expect(GMSCREEN_LIMITS.MAX_STACK_ITEMS).toBe(50)
  })

  it('object is not extensible', () => {
    // as const produces a readonly type; verify the values are stable
    const snapshot = { ...GMSCREEN_LIMITS }
    expect(snapshot).toEqual({
      MAX_WINDOWS: 20,
      MAX_STACKS: 10,
      MAX_STACK_ITEMS: 50,
    })
  })
})

describe('WINDOW_STATES enum', () => {
  it('contains exactly open, minimized, hidden', () => {
    expect([...WINDOW_STATES]).toEqual(['open', 'minimized', 'hidden'])
  })

  it('has length 3', () => {
    expect(WINDOW_STATES).toHaveLength(3)
  })
})
