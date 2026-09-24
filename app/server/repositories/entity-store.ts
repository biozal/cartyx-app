import type { EntityStore } from '../db/graph/entity-store';

/**
 * The one place server functions get their entity store from.
 *
 * At runtime it is the JanusGraph store, reached through the restricted application
 * principal. It is composed on first use, and `data-runtime` is imported on first use
 * too, because that module validates its credentials as it loads — importing a server
 * function must not require a configured environment. Unit tests replace this module
 * with an in-memory store that satisfies the same contract, so they exercise real query
 * behaviour rather than mocked driver calls.
 */
let store: EntityStore | undefined;
let listening = false;

export async function entityStore(): Promise<EntityStore> {
  if (!store) {
    const { getGraphClient, onDataClose } = await import('../db/data-runtime');
    const { createGraphEntityStore } = await import('../db/graph/graph-entity-store');
    if (!listening) {
      listening = true;
      // A closed client must not be reused; the next call composes afresh.
      onDataClose(() => {
        store = undefined;
      });
    }
    store = createGraphEntityStore(getGraphClient());
  }
  return store;
}
