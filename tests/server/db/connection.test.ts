import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEntityStore } = vi.hoisted(() => ({ mockEntityStore: vi.fn() }));
vi.mock('~/server/repositories/entity-store', () => ({ entityStore: mockEntityStore }));

import { connectDB, isDBConnected, __resetConnectPromiseForTests } from '~/server/db/connection';

beforeEach(() => {
  vi.clearAllMocks();
  __resetConnectPromiseForTests();
  mockEntityStore.mockResolvedValue({});
});

describe('connectDB', () => {
  it('composes the graph entity store and reports connected', async () => {
    expect(isDBConnected()).toBe(false);
    await connectDB();
    expect(mockEntityStore).toHaveBeenCalled();
    expect(isDBConnected()).toBe(true);
  });

  it('tags a composition failure with status 503 when it has no own status', async () => {
    mockEntityStore.mockRejectedValueOnce(new Error('Missing GREMLIN_URL'));
    await expect(connectDB()).rejects.toMatchObject({ status: 503 });
    expect(isDBConnected()).toBe(false);
  });

  it('does not overwrite an existing status on the rethrown error', async () => {
    mockEntityStore.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 401 }));
    await expect(connectDB()).rejects.toMatchObject({ status: 401 });
  });
});
