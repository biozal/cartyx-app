// @vitest-environment node
import { beforeEach, describe, it, vi } from 'vitest';

vi.mock('~/server/repositories/entity-store', () => import('../functions/entityStoreDouble'));
import { resetEntityStore } from '../functions/entityStoreDouble';
import { graphModelContract } from '../../contracts/graph-model.contract';

beforeEach(() => resetEntityStore());

describe('graph model', () => {
  it('satisfies the shared graph-model contract in memory', async () => {
    await graphModelContract();
  });
});
