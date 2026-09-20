// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { runSeeders, type Seeder } from '../../scripts/seed/registry';

const record = (calls: string[], name: string): Seeder => ({
  name,
  seed: vi.fn(async () => {
    calls.push(`seed:${name}`);
  }),
  clear: vi.fn(async () => {
    calls.push(`clear:${name}`);
  }),
});

describe('seed registry', () => {
  it('seeds in dependency order and clears in reverse', async () => {
    const calls: string[] = [];
    const seeders = [
      record(calls, 'users'),
      record(calls, 'campaigns'),
      record(calls, 'locations'),
    ];
    await runSeeders(seeders, 'seed');
    await runSeeders(seeders, 'clear');
    expect(calls).toEqual([
      'seed:users',
      'seed:campaigns',
      'seed:locations',
      'clear:locations',
      'clear:campaigns',
      'clear:users',
    ]);
  });

  it('stops at the first failure instead of leaving a half-built environment', async () => {
    const calls: string[] = [];
    const failing: Seeder = {
      name: 'campaigns',
      seed: async () => {
        throw new Error('campaign seed failed');
      },
      clear: async () => {},
    };
    const seeders = [record(calls, 'users'), failing, record(calls, 'locations')];
    await expect(runSeeders(seeders, 'seed')).rejects.toThrow(/campaigns: campaign seed failed/);
    expect(calls).toEqual(['seed:users']);
  });
});
