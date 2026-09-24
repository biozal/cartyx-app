import { PlanId, type PlanDocument, type PlanValue } from './plan';

/**
 * Every collection that has moved to the graph: how the seed plan writes it, and how a
 * reset empties it. A slice adds its collection here; the seeder, the reset and the
 * fixtures all follow this one list.
 *
 * Order matters for clearing: collections are emptied in reverse, so anything that
 * refers to another collection is removed before what it refers to.
 */
export interface GraphCollection {
  name: string;
  write(documents: PlanDocument[]): Promise<void>;
  clear(): Promise<number>;
}

/** Plan documents carry ids as `PlanId`; the graph stores them as 24-hex strings. */
export function toGraphDocument(value: PlanValue): unknown {
  if (value instanceof PlanId) return value.hex;
  if (value instanceof Date || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(toGraphDocument);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, toGraphDocument(item)])
  );
}

export const graphCollections: GraphCollection[] = [
  {
    name: 'campaigns',
    async write(documents) {
      const { insertCampaignDocuments, campaignDocumentSchema } =
        await import('../../app/server/repositories/campaigns');
      await insertCampaignDocuments(
        documents.map((document) => campaignDocumentSchema.parse(toGraphDocument(document)))
      );
    },
    async clear() {
      const { campaigns } = await import('../../app/server/repositories/campaigns');
      let removed = 0;
      for (const campaign of await campaigns.listAll())
        if (await campaigns.remove(campaign._id)) removed++;
      return removed;
    },
  },
  // Models on the graph: written through their schema, like a Mongoose insert.
  ...(
    Object.keys(
      (await import('../../app/server/db/models/graph-models')).graphModels
    ) as import('../../app/server/db/models/graph-models').GraphModelName[]
  ).map((name): GraphCollection => ({
    name,
    async write(documents) {
      const { graphModels } = await import('../../app/server/db/models/graph-models');
      await graphModels[name].insertMany(
        documents.map((document) => toGraphDocument(document) as Record<string, unknown>)
      );
    },
    async clear() {
      const { graphModels } = await import('../../app/server/db/models/graph-models');
      return (await graphModels[name].deleteMany({})).deletedCount;
    },
  })),
];

export const graphCollectionRoutes = Object.fromEntries(
  graphCollections.map((collection) => [collection.name, collection.write])
);

/** Empties every migrated collection, most dependent first. Accounts are not touched. */
export async function clearGraphCollections(): Promise<Record<string, number>> {
  const removed: Record<string, number> = {};
  for (const collection of [...graphCollections].reverse())
    removed[collection.name] = await collection.clear();
  return removed;
}
