// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `listPackages` against the REAL graph model on the in-memory entity store,
 * rather than a per-method mock of `AudioPackage`.
 *
 * `tests/server/functions/packages.test.ts` mocks the model, which is the
 * right tool for asserting the ARGUMENTS the function passes (that each arm of
 * the split visibility read carries a bare, pushed-down `ownerId` and no
 * `$or`) — but it cannot say anything about what those arguments SELECT: a
 * mock returns whatever it was told regardless of what the query asked for.
 * This file is the other half. Every row here is written through the real
 * model and read back through the real filter, so:
 *
 *  - `{ ownerId: null }` is only a correct system-package arm if the store
 *    genuinely resolves it to "the property is absent" (the `hasNot` pushdown)
 *    rather than to "equals the literal null", which nothing in a mocked test
 *    exercises;
 *  - another user's package being absent from the result is a real exclusion
 *    rather than a fixture that never offered one;
 *  - the page boundary is computed over rows the store really ordered.
 *
 * `beforeEach(resetEntityStore())` is not optional. Vitest isolates per FILE,
 * not per test, so without it the rows seeded by one `it()` are still there
 * for the next and every count in this file would be unreliable.
 */
vi.mock('~/server/db/connection', () => ({ connectDB: vi.fn(), isDBConnected: vi.fn(() => true) }));
vi.mock('~/server/utils/telemetry', () => ({
  serverCaptureException: vi.fn(),
  serverCaptureEvent: vi.fn(),
}));
vi.mock('~/server/repositories/entity-store', () => import('./entityStoreDouble'));

const { resetEntityStore } = await import('./entityStoreDouble');
const { AudioPackage } = await import('~/server/db/models/AudioPackage');
const { listPackages } = await import('~/server/functions/packages');

const OWNER = '1'.repeat(24);
const OTHER = '2'.repeat(24);

const seed = (ownerId: string | null, name: string) =>
  AudioPackage.create({ ownerId, name, description: null, items: [], moods: [] });

const names = (items: { name: string }[]) => items.map((p) => p.name);

beforeEach(() => resetEntityStore());

describe('listPackages (real model, in-memory store)', () => {
  it("returns the caller's own packages and the system ones, and nobody else's", async () => {
    await seed(OWNER, 'mine');
    await seed(null, 'system');
    await seed(OTHER, 'theirs');

    const { items } = await listPackages({ data: { limit: 50 }, userId: OWNER });
    expect(names(items).sort()).toEqual(['mine', 'system']);
  });

  /**
   * The same read from the OTHER user's side. Without this, "theirs" being
   * absent above could just as well mean the row was never written — this
   * pins that it exists and is simply not visible to `OWNER`.
   */
  it('shows each owner their own set, with the same system packages in both', async () => {
    await seed(OWNER, 'mine');
    await seed(null, 'system');
    await seed(OTHER, 'theirs');

    expect(
      names((await listPackages({ data: { limit: 50 }, userId: OTHER })).items).sort()
    ).toEqual(['system', 'theirs']);
  });

  /**
   * The system arm is `{ ownerId: null }`, and the store writes an absent
   * property rather than a literal null — so this is the case that would break
   * if the null-index pushdown resolved to an equality rather than a `hasNot`.
   */
  it('finds a system package through the null arm with no owned packages at all', async () => {
    await seed(null, 'system');
    const { items } = await listPackages({ data: { limit: 50 }, userId: OWNER });
    expect(names(items)).toEqual(['system']);
    expect(items[0].ownerId).toBeNull();
  });

  it('orders the union of both arms by name', async () => {
    await seed(OWNER, 'bravo');
    await seed(null, 'alpha');
    await seed(OWNER, 'delta');
    await seed(null, 'charlie');

    const { items } = await listPackages({ data: { limit: 50 }, userId: OWNER });
    expect(names(items)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
  });

  it('pages across the union and resumes from the cursor', async () => {
    for (const name of ['a', 'b', 'c', 'd']) await seed(OWNER, name);
    await seed(null, 'bb');

    const first = await listPackages({ data: { limit: 2 }, userId: OWNER });
    expect(names(first.items)).toEqual(['a', 'b']);
    expect(first.nextCursor).not.toBeNull();

    const second = await listPackages({
      data: { limit: 2, cursor: first.nextCursor! },
      userId: OWNER,
    });
    expect(names(second.items)).toEqual(['bb', 'c']);
    expect(second.nextCursor).not.toBeNull();

    const third = await listPackages({
      data: { limit: 2, cursor: second.nextCursor! },
      userId: OWNER,
    });
    expect(names(third.items)).toEqual(['d']);
    expect(third.nextCursor).toBeNull();
  });

  /**
   * Two packages may share a name — the caller's clone of a system package
   * routinely does — and the page boundary is the case where a non-total
   * order repeats or drops one of them.
   */
  it('pages through a duplicated name without repeating or dropping a row', async () => {
    await seed(OWNER, 'Storm Set');
    await seed(null, 'Storm Set');
    await seed(OWNER, 'Storm Set');

    const seen: string[] = [];
    let cursor: string | null | undefined;
    for (let requests = 0; requests < 5; requests += 1) {
      const page: { items: { id: string }[]; nextCursor: string | null } = await listPackages({
        data: { limit: 1, ...(cursor ? { cursor } : {}) },
        userId: OWNER,
      });
      seen.push(...page.items.map((p) => p.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toHaveLength(3);
    expect(new Set(seen).size).toBe(3);
  });

  /**
   * The counts the list renders, computed by the projection against a real
   * stored document rather than asserted on a mock's canned row.
   */
  it('returns item and mood counts without the arrays themselves', async () => {
    await AudioPackage.create({
      ownerId: OWNER,
      name: 'counted',
      items: [
        { id: 'i1', assetId: '3'.repeat(24) },
        { id: 'i2', assetId: '4'.repeat(24) },
      ],
      moods: [{ id: 'm1', name: 'calm', states: [] }],
    });

    const { items } = await listPackages({ data: { limit: 50 }, userId: OWNER });
    expect(items[0].itemCount).toBe(2);
    expect(items[0].moodCount).toBe(1);
    expect(items[0]).not.toHaveProperty('items');
    expect(items[0]).not.toHaveProperty('moods');
  });

  it('fails closed on an undecodable cursor instead of serving page 1 again', async () => {
    await seed(OWNER, 'a');
    await expect(
      listPackages({ data: { limit: 1, cursor: 'garbage' }, userId: OWNER })
    ).rejects.toThrow('Invalid pagination cursor');
  });
});
