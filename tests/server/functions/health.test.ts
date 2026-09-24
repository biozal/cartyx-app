import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockConnectDB, mockRequireDataAvailable } = vi.hoisted(() => ({
  mockConnectDB: vi.fn(),
  mockRequireDataAvailable: vi.fn(),
}));

vi.mock('~/server/db/connection', () => ({ connectDB: mockConnectDB }));
vi.mock('~/server/db/data-runtime', () => ({ requireDataAvailable: mockRequireDataAvailable }));

import { healthCheck } from '~/server/functions/health';
import { DataUnavailableError } from '~/server/db/data-unavailable';

beforeEach(() => {
  vi.clearAllMocks();
  mockConnectDB.mockResolvedValue(undefined);
  mockRequireDataAvailable.mockResolvedValue(undefined);
});

describe('healthCheck', () => {
  it('connects, probes the data stores, and reports ok', async () => {
    await expect(healthCheck()).resolves.toEqual({ ok: true });
    expect(mockConnectDB).toHaveBeenCalled();
    expect(mockRequireDataAvailable).toHaveBeenCalled();
  });

  it('fails with a 503 "Database not connected" when a store is unavailable', async () => {
    mockRequireDataAvailable.mockRejectedValue(new DataUnavailableError());
    await expect(healthCheck()).rejects.toMatchObject({
      status: 503,
      message: 'Database not connected',
    });
  });

  it('propagates a failure to compose the data runtime', async () => {
    mockConnectDB.mockRejectedValue(
      Object.assign(new Error('Missing GREMLIN_URL'), { status: 503 })
    );
    await expect(healthCheck()).rejects.toMatchObject({ status: 503 });
    expect(mockRequireDataAvailable).not.toHaveBeenCalled();
  });
});
