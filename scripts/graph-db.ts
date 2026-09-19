/**
 * `db.collection(name)` for E2E specs and development fixtures: the driver interface
 * over every migrated collection (see app/server/db/graph-driver.ts), falling back to
 * MongoDB for any collection not yet moved.
 */
import { graphModels, type GraphModelName } from '../app/server/db/models/graph-models';
import { graphCollection } from '../app/server/db/graph-driver';

export { ObjectId, graphCollection } from '../app/server/db/graph-driver';

/** Anything with a driver-style `collection(name)`, for the not-yet-migrated fallback. */
interface DriverDb {
  collection(name: string): unknown;
}

/**
 * Wraps a MongoDB `Db` (or stands in for one) so `collection(name)` is answered by the
 * graph for migrated collections and by MongoDB for the rest. It keeps the wrapped
 * handle's type, so code written against the driver needs no other change. With no
 * handle, an unmigrated name is an error.
 */
export function graphDb<D extends DriverDb | null | undefined>(mongo: D): NonNullable<D> {
  const target = (mongo ?? {}) as object;
  return new Proxy(target, {
    get(object, property, receiver) {
      if (property !== 'collection') return Reflect.get(object, property, receiver);
      return (name: string, ...rest: unknown[]) => {
        if (name in graphModels) return graphCollection(graphModels[name as GraphModelName]);
        if (mongo) return (mongo.collection as (...args: unknown[]) => unknown)(name, ...rest);
        throw new Error(`${name} is not on the graph and no MongoDB handle was given`);
      };
    },
  }) as NonNullable<D>;
}
