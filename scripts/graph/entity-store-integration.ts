// Runs the shared entity-store contract against a real JanusGraph/Cassandra stack,
// through the restricted application principal. Operator credentials are used only to
// remove the exact fixtures this run created.
import { createGraphClient } from '../../app/server/db/graph/client';
import { readGraphConfig } from '../../app/server/db/graph/config';
import { createGraphEntityStore } from '../../app/server/db/graph/graph-entity-store';
import { findIdentity, graphIdentity } from '../../app/server/db/graph/identity';
import { scopeKey } from '../../app/server/db/graph/entity-codec';
import { entityStoreContract } from '../../tests/contracts/entity-store.contract';
import { graphTestConnections } from '../identity/graph-test-connections';

const { runtime, operator, restricted } = graphTestConnections();
if (!restricted)
  throw new Error('Set IDENTITY_GRAPH_OPERATOR_PASSWORD_FILE and run as the application principal');

const store = createGraphEntityStore(createGraphClient(runtime));
const operatorClient = createGraphClient(operator);

await entityStoreContract(async () => ({
  store,
  cleanup: async (refs) => {
    for (const ref of refs) {
      const identity = graphIdentity(ref.kind, ref.id, ref.scope);
      await operatorClient.execute(findIdentity(identity).drop());
      const remaining = await operatorClient.execute(findIdentity(identity).count());
      if (Number(remaining[0]) !== 0)
        throw new Error(`Fixture ${ref.kind} ${scopeKey(ref.scope)} was not removed`);
    }
  },
}));

process.stdout.write(
  'PASS: entity store create/read/revisioned update/concurrent mutation, filtered, ordered and paged listing, scoped word search, ordered edges, bounded traversal and removal against real JanusGraph\n'
);
