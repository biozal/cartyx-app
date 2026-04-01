import { describe, it, expect, vi, beforeAll } from 'vitest'
import { GMSCREEN_LIMITS, WINDOW_STATES, GMScreen } from '~/server/db/models/GMScreen'

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

  it('contains exactly the expected keys and values', () => {
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

/*
 * Schema-level tests (validators, indexes) need real mongoose.
 * The global setup mocks mongoose, so we unmock + reset modules and
 * dynamically import the real GMScreen model to inspect its schema.
 */
describe('GMScreen schema validators', () => {
  type ValidatorFn = (v: unknown) => boolean
  let windowsValidator: ValidatorFn
  let stacksValidator: ValidatorFn
  let stackItemsValidator: ValidatorFn
  let indexes: [Record<string, number>, Record<string, unknown>][]

  beforeAll(async () => {
    // Remove the global mongoose mock and reset the module registry so that
    // the next dynamic import picks up the real mongoose package.
    vi.unmock('mongoose')
    vi.resetModules()

    const realModelModule = await import('~/server/db/models/GMScreen')

    const RealGMScreen = realModelModule.GMScreen as any

    const windowsPath = RealGMScreen.schema.path('windows')
    const stacksPath = RealGMScreen.schema.path('stacks')

    // stacks.items is nested inside the stacks sub-schema, not a top-level path
    const stackItemsPath = stacksPath.schema.path('items')

    const extractValidator = (schemaPath: any): ValidatorFn => {
      if (!schemaPath) {
        throw new Error('Expected schema path to be defined for validator extraction')
      }

      const v = schemaPath.options?.validate

      if (Array.isArray(v) && v.length > 0) {
        return v[0].validator as ValidatorFn
      }

      if (v && typeof v === 'object' && 'validator' in v) {
        return v.validator as ValidatorFn
      }

      return v as ValidatorFn
    }

    windowsValidator = extractValidator(windowsPath)
    stacksValidator = extractValidator(stacksPath)
    stackItemsValidator = extractValidator(stackItemsPath)

    indexes = RealGMScreen.schema.indexes()
  })

  describe('windows max-length', () => {
    it('accepts an array at the limit', () => {
      expect(windowsValidator(new Array(GMSCREEN_LIMITS.MAX_WINDOWS))).toBe(true)
    })

    it('rejects an array exceeding the limit', () => {
      expect(windowsValidator(new Array(GMSCREEN_LIMITS.MAX_WINDOWS + 1))).toBe(false)
    })

    it('rejects non-array values', () => {
      expect(windowsValidator(null)).toBe(false)
      expect(windowsValidator(undefined)).toBe(false)
      expect(windowsValidator('not-an-array')).toBe(false)
    })
  })

  describe('stacks max-length', () => {
    it('accepts an array at the limit', () => {
      expect(stacksValidator(new Array(GMSCREEN_LIMITS.MAX_STACKS))).toBe(true)
    })

    it('rejects an array exceeding the limit', () => {
      expect(stacksValidator(new Array(GMSCREEN_LIMITS.MAX_STACKS + 1))).toBe(false)
    })

    it('rejects non-array values', () => {
      expect(stacksValidator(null)).toBe(false)
      expect(stacksValidator(undefined)).toBe(false)
      expect(stacksValidator('not-an-array')).toBe(false)
    })
  })

  describe('stacks.items max-length', () => {
    it('accepts an array at the limit', () => {
      expect(stackItemsValidator(new Array(GMSCREEN_LIMITS.MAX_STACK_ITEMS))).toBe(true)
    })

    it('rejects an array exceeding the limit', () => {
      expect(stackItemsValidator(new Array(GMSCREEN_LIMITS.MAX_STACK_ITEMS + 1))).toBe(false)
    })

    it('rejects non-array values', () => {
      expect(stackItemsValidator(null)).toBe(false)
      expect(stackItemsValidator(undefined)).toBe(false)
      expect(stackItemsValidator('not-an-array')).toBe(false)
    })
  })

  describe('indexes', () => {
    it('declares a unique compound index on { campaignId, name }', () => {
      const match = indexes.find(
        ([fields, opts]) =>
          fields.campaignId === 1 && fields.name === 1 && opts?.unique === true,
      )
      expect(match).toBeDefined()
    })

    it('declares a compound index on { campaignId, tabOrder }', () => {
      const match = indexes.find(
        ([fields]) => fields.campaignId === 1 && fields.tabOrder === 1,
      )
      expect(match).toBeDefined()
    })
  })
})
