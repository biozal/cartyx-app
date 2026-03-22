import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock server-only modules for client-side tests
vi.mock('@tanstack/react-start/server', () => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
  getRequest: vi.fn(() => new Request('http://localhost/')),
}))

class MockSchema {
  constructor(_def?: unknown) {}
  static Types = { ObjectId: String }
}

const mockModel = vi.fn(() => ({
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  findById: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  exists: vi.fn(),
  save: vi.fn(),
  updateOne: vi.fn(),
}))

vi.mock('mongoose', () => ({
  default: {
    connect: vi.fn(),
    connection: { readyState: 0 },
    Schema: MockSchema,
    model: mockModel,
    models: {},
  },
  Schema: MockSchema,
  model: mockModel,
  models: {},
  connection: { readyState: 0 },
}))
