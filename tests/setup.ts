import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock server-only modules for client-side tests
vi.mock('@tanstack/react-start/server', () => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
  getRequest: vi.fn(() => new Request('http://localhost/')),
}));
