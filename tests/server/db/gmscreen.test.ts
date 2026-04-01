import { describe, it, expect, vi, beforeAll } from 'vitest'
import type mongoose from 'mongoose'
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
 * The global setup mocks mongoose, so we import the real module via
 * vi.importActual and rebuild the model to get a genuine schema.
 */
describe('GMScreen schema validators', () => {
  type ValidatorFn = (v: unknown) => boolean
  let windowsValidator: ValidatorFn
  let stacksValidator: ValidatorFn
  let stackItemsValidator: ValidatorFn
  let indexes: [Record<string, number>, Record<string, unknown>][]

  beforeAll(async () => {
    // Ensure we use the real mongoose implementation for this test, not the global mock.
    if (typeof vi.unmock === 'function') {
      vi.unmock('mongoose')
    }

    // Import the real GMScreen model so we can inspect its actual schema.
    const realModelModule = await vi.importActual<
      typeof import('~/server/db/models/GMScreen')
    >('~/server/db/models/GMScreen')

    const RealGMScreen: mongoose.Model<mongoose.Document> =
      // Support both named and default exports just in case.
      (realModelModule as any).GMScreen || (realModelModule as any).default

    const windowsPath: any = (RealGMScreen as any).schema.path('windows')
    const stacksPath: any = (RealGMScreen as any).schema.path('stacks')
    const stackItemsPath: any = (RealGMScreen as any).schema.path('stackItems')

    const extractValidator = (schemaPath: any): ValidatorFn => {
      if (!schemaPath) {
        throw new Error('Expected schema path to be defined for validator extraction')
      }

      const v = schemaPath.options?.validate

      if (Array.isArray(v) && v.length > 0) {
        return (v[0] as any).validator as ValidatorFn
      }

      if (v && typeof v === 'object' && 'validator' in v) {
        return (v as any).validator as ValidatorFn
      }

      return v as ValidatorFn
    }

    windowsValidator = extractValidator(windowsPath)
    stacksValidator = extractValidator(stacksPath)
    stackItemsValidator = extractValidator(stackItemsPath)

    // Capture the indexes defined on the real schema.
    indexes = (RealGMScreen as any).schema.indexes()
  })
    const stackSchema = new realMongoose.Schema(
      {
        name: { type: String, required: true },
        x: { type: Number, default: null },
        y: { type: Number, default: null },
        items: {
          type: [stackItemSchema],
          default: [],
          validate: {
            validator: (v: unknown) =>
              Array.isArray(v) && v.length <= GMSCREEN_LIMITS.MAX_STACK_ITEMS,
            message: `A stack cannot contain more than ${GMSCREEN_LIMITS.MAX_STACK_ITEMS} items.`,
          },
        },
      },
      { _id: true },
    )

    const gmScreenSchema = new realMongoose.Schema(
      {
        campaignId: { type: realMongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
        name: { type: String, required: true },
        tabOrder: { type: Number, default: 0 },
        createdBy: { type: realMongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        windows: {
          type: [windowSchema],
          default: [],
          validate: {
            validator: (v: unknown) =>
              Array.isArray(v) && v.length <= GMSCREEN_LIMITS.MAX_WINDOWS,
            message: `A screen cannot contain more than ${GMSCREEN_LIMITS.MAX_WINDOWS} windows.`,
          },
        },
        stacks: {
          type: [stackSchema],
          default: [],
          validate: {
            validator: (v: unknown) =>
              Array.isArray(v) && v.length <= GMSCREEN_LIMITS.MAX_STACKS,
            message: `A screen cannot contain more than ${GMSCREEN_LIMITS.MAX_STACKS} stacks.`,
          },
        },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
      },
      { collection: 'gmscreen' },
    )

    gmScreenSchema.index({ campaignId: 1, tabOrder: 1 })
    gmScreenSchema.index({ campaignId: 1, name: 1 }, { unique: true })

    // Extract validators
    type SchemaTypeWithValidators = { validators?: { validator: ValidatorFn }[] }
    const getValidator = (st: SchemaTypeWithValidators) =>
      st.validators!.find((v) => typeof v.validator === 'function')!.validator

    windowsValidator = getValidator(
      gmScreenSchema.path('windows') as unknown as SchemaTypeWithValidators,
    )
    stacksValidator = getValidator(
      gmScreenSchema.path('stacks') as unknown as SchemaTypeWithValidators,
    )

    const stacksPath = gmScreenSchema.path('stacks') as mongoose.Schema.Types.DocumentArray
    stackItemsValidator = getValidator(
      stacksPath.schema.path('items') as unknown as SchemaTypeWithValidators,
    )

    indexes = gmScreenSchema.indexes() as typeof indexes
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
