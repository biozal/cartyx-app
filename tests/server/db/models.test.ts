import { describe, it, expect } from 'vitest'
import { Session } from '~/server/db/models/Session'
import { GMScreen } from '~/server/db/models/GMScreen'
import { Note } from '~/server/db/models/Note'

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

describe('Note model', () => {
  it('is exported and defined', () => {
    expect(Note).toBeDefined()
  })
})
