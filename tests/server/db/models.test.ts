import { describe, it, expect } from 'vitest'
import { Session } from '~/server/db/models/Session'
import { GMScreen } from '~/server/db/models/GMScreen'

describe('Session model', () => {
  it('is exported and defined', () => {
    expect(Session).toBeDefined()
  })
})

describe('GMScreen model', () => {
  it('is exported and defined', () => {
    expect(GMScreen).toBeDefined()
  })
})
