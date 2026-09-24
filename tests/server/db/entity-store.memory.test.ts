// @vitest-environment node
import { it } from 'vitest';
import { createMemoryEntityStore } from '~/server/db/graph/memory-entity-store';
import { entityStoreContract } from '../../contracts/entity-store.contract';

it('satisfies the entity store contract in memory', async () => {
  await entityStoreContract(async () => ({
    store: createMemoryEntityStore(),
    cleanup: async () => {},
  }));
});
