/**
 * Graph-backed data access for Playwright global setup and specs.
 *
 * Global setup runs as a standalone Node script outside the app's bundling, so
 * everything here imports by relative path rather than the `~` alias.
 *
 * Subsystems arrive one slice at a time: each slice replaces its Mongo fixture
 * code with calls to the store opened here. Until the last slice lands, global
 * setup uses both this module and mongoose.
 */
import { z } from 'zod';
import { createGraphClient } from '../../app/server/db/graph/client';
import { readGraphConfig } from '../../app/server/db/graph/config';
import { defineEntity } from '../../app/server/db/graph/entity-codec';
import type { EntityStore } from '../../app/server/db/graph/entity-store';
import { createGraphEntityStore } from '../../app/server/db/graph/graph-entity-store';
import type { EntityScope } from '../../app/server/db/graph/identity';

export const E2E_SCOPE: EntityScope = { type: 'global' };

let store: EntityStore | undefined;

/**
 * The store fixtures write through. It uses the restricted application principal,
 * exactly as the running app does, so a fixture cannot set up state the product
 * itself would be refused. The transport opens and closes a connection per
 * request, so there is nothing to shut down at the end of a run.
 */
export function entityStore(): EntityStore {
  if (!store) {
    const config = readGraphConfig();
    if (config.username === 'cartyx_admin')
      throw new Error('E2E fixtures must not use the operator credential');
    store = createGraphEntityStore(createGraphClient(config));
  }
  return store;
}

/** Counted, never written: the probe exercises the index, serializer and policy. */
const readinessProbe = defineEntity({
  kind: 'ReadinessProbe',
  version: 1,
  schema: z.object({}),
  index: {},
});

/**
 * Fails before any seeding when the graph is unreachable or its schema is absent.
 * Without this, a missing stack surfaces much later as an unexplained empty page
 * in whichever spec happens to run first.
 */
export async function assertGraphReady(): Promise<void> {
  try {
    await entityStore().count(readinessProbe, E2E_SCOPE);
  } catch (cause) {
    throw new Error(
      'The graph is not reachable with a usable schema. Start it with `npm run db:up` ' +
        'and install the schema with `npm run graph:schema -- apply`.',
      { cause }
    );
  }
}
