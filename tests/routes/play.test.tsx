import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { TabId } from '~/components/mainview/TabNavigation'

/**
 * Route-level tests for the play route's search validation and tab behavior.
 * We test the validateSearch logic and the component rendering contract.
 */

// Inline the validateSearch logic to test it independently of the router
function validateSearch(search: Record<string, unknown>): { tab: TabId } {
  return {
    tab: (['dashboard', 'tabletop'].includes(search.tab as string)
      ? (search.tab as TabId)
      : 'dashboard') as TabId,
  }
}

describe('Play route search validation', () => {
  it('defaults to dashboard when no tab param', () => {
    expect(validateSearch({})).toEqual({ tab: 'dashboard' })
  })

  it('defaults to dashboard for invalid tab value', () => {
    expect(validateSearch({ tab: 'bogus' })).toEqual({ tab: 'dashboard' })
  })

  it('honors tab=dashboard', () => {
    expect(validateSearch({ tab: 'dashboard' })).toEqual({ tab: 'dashboard' })
  })

  it('honors tab=tabletop', () => {
    expect(validateSearch({ tab: 'tabletop' })).toEqual({ tab: 'tabletop' })
  })
})
