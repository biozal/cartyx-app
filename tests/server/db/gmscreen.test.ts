// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('~/server/repositories/entity-store', () => import('../functions/entityStoreDouble'));
import { resetEntityStore } from '../functions/entityStoreDouble';
import { GMSCREEN_LIMITS, GMScreen, gmScreenSchema } from '~/server/db/models/GMScreen';
import { WINDOW_STATES } from '~/types/gmscreen';

describe('GMScreen model exports', () => {
  it('is exported and defined', () => {
    expect(GMScreen).toBeDefined();
  });
});

describe('GMSCREEN_LIMITS constants', () => {
  it('defines MAX_WINDOWS as 20', () => {
    expect(GMSCREEN_LIMITS.MAX_WINDOWS).toBe(20);
  });

  it('defines MAX_STACKS as 10', () => {
    expect(GMSCREEN_LIMITS.MAX_STACKS).toBe(10);
  });

  it('defines MAX_STACK_ITEMS as 50', () => {
    expect(GMSCREEN_LIMITS.MAX_STACK_ITEMS).toBe(50);
  });

  it('contains exactly the expected keys and values', () => {
    const snapshot = { ...GMSCREEN_LIMITS };
    expect(snapshot).toEqual({
      MAX_WINDOWS: 20,
      MAX_STACKS: 10,
      MAX_STACK_ITEMS: 50,
    });
  });
});

describe('WINDOW_STATES enum', () => {
  it('contains exactly open, minimized, hidden', () => {
    expect([...WINDOW_STATES]).toEqual(['open', 'minimized', 'hidden']);
  });

  it('has length 3', () => {
    expect(WINDOW_STATES).toHaveLength(3);
  });
});

describe('GMScreen schema limits', () => {
  const ID = '65c0000000000000000000c1';
  const screen = (overrides: Record<string, unknown>) =>
    gmScreenSchema.safeParse({ _id: ID, campaignId: ID, createdBy: ID, name: 'S', ...overrides });
  const window = { collection: 'lore', documentId: ID };
  const stack = (items: unknown[] = []) => ({ name: 'Stack', items });

  it('accepts windows up to the limit and rejects one more', () => {
    expect(screen({ windows: Array(GMSCREEN_LIMITS.MAX_WINDOWS).fill(window) }).success).toBe(true);
    expect(screen({ windows: Array(GMSCREEN_LIMITS.MAX_WINDOWS + 1).fill(window) }).success).toBe(
      false
    );
  });

  it('accepts stacks up to the limit and rejects one more', () => {
    expect(screen({ stacks: Array(GMSCREEN_LIMITS.MAX_STACKS).fill(stack()) }).success).toBe(true);
    expect(screen({ stacks: Array(GMSCREEN_LIMITS.MAX_STACKS + 1).fill(stack()) }).success).toBe(
      false
    );
  });

  it('accepts stack items up to the limit and rejects one more', () => {
    const items = (n: number) => Array(n).fill(window);
    expect(screen({ stacks: [stack(items(GMSCREEN_LIMITS.MAX_STACK_ITEMS))] }).success).toBe(true);
    expect(screen({ stacks: [stack(items(GMSCREEN_LIMITS.MAX_STACK_ITEMS + 1))] }).success).toBe(
      false
    );
  });

  it('gives windows, stacks and stack items their own ids, as Mongoose did', () => {
    const parsed = gmScreenSchema.parse({
      _id: ID,
      campaignId: ID,
      createdBy: ID,
      name: 'S',
      windows: [window],
      stacks: [stack([window])],
    });
    expect(parsed.windows[0]._id).toMatch(/^[0-9a-f]{24}$/);
    expect(parsed.stacks[0]._id).toMatch(/^[0-9a-f]{24}$/);
    expect(parsed.stacks[0].items[0]._id).toMatch(/^[0-9a-f]{24}$/);
  });
});

describe('GMScreen unique keys', () => {
  beforeEach(() => resetEntityStore());
  const campaignId = '65c0000000000000000000c1';
  const createdBy = '65c0000000000000000000a1';

  it('refuses a second screen with the same name in a campaign', async () => {
    await GMScreen.create({ campaignId, createdBy, name: 'Main', tabOrder: 0 });
    await expect(
      GMScreen.create({ campaignId, createdBy, name: 'Main', tabOrder: 1 })
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('refuses a second screen at the same tab order in a campaign', async () => {
    await GMScreen.create({ campaignId, createdBy, name: 'One', tabOrder: 0 });
    await expect(
      GMScreen.create({ campaignId, createdBy, name: 'Two', tabOrder: 0 })
    ).rejects.toMatchObject({ code: 11000, message: expect.stringContaining('tabOrder') });
  });
});
