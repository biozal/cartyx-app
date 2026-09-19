import { createMemoryEntityStore } from '~/server/db/graph/memory-entity-store';
import type { EntityStore } from '~/server/db/graph/entity-store';

/**
 * Stands in for `~/server/repositories/entity-store` in unit tests:
 *
 *   vi.mock('~/server/repositories/entity-store', () => import('./entityStoreDouble'));
 *
 * then call `resetEntityStore()` in `beforeEach`. The in-memory store satisfies the same
 * contract as the graph store (`tests/contracts/entity-store.contract.ts`), so a test
 * seeds data through the real repositories and asserts on real query results.
 */
let store: EntityStore = createMemoryEntityStore();

export function resetEntityStore(): EntityStore {
  store = createMemoryEntityStore();
  return store;
}

export async function entityStore(): Promise<EntityStore> {
  return store;
}

/** The current store, for a test that wants to seed or inspect it directly. */
export function currentEntityStore(): EntityStore {
  return store;
}
