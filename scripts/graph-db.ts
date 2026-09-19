/**
 * `db.collection(name)` for E2E specs and development fixtures: the MongoDB driver's
 * interface over every collection, answered by the graph (see
 * app/server/db/graph-driver.ts).
 */
import { graphModels, type GraphModelName } from '../app/server/db/models/graph-models';
import { graphCollection } from '../app/server/db/graph-driver';

export { ObjectId, graphCollection } from '../app/server/db/graph-driver';

/** A driver-style database handle over the graph. */
export interface Db {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- specs use the driver's untyped documents
  collection(name: string): any;
}

/** `db.collection(name)`, answered by the graph for every collection the app has. */
export function graphDb(): Db {
  return {
    collection(name: string) {
      if (!(name in graphModels)) throw new Error(`${name} is not a graph collection`);
      return graphCollection(graphModels[name as GraphModelName]);
    },
  };
}
