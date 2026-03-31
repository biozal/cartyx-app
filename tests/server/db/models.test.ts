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

/**
 * ALL_MODELS membership is validated in tests/server/db/inspect.test.ts
 * which uses real model mocks with modelName properties. The global mongoose
 * mock in setup.ts does not populate modelName, so ALL_MODELS checks belong
 * in the inspect test suite where Session/GMScreen are already verified.
 */
