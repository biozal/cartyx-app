/**
 * Campaigns for E2E specs, now that they live in the graph.
 *
 * Specs used to write the MongoDB `campaigns` collection directly. This answers exactly the
 * calls they make — in the MongoDB driver's result shape, so a spec only changes where
 * it gets the collection from — and throws on anything else, so a new use is added here
 * deliberately rather than silently misbehaving. Writes go through the campaigns
 * repository, which keeps the membership index and invite-code key consistent.
 *
 * `_id` comes back as an ObjectId, as it does from every other collection's driver
 * interface (scripts/graph-db.ts), because specs build filters and references from it.
 */
import {
  campaignDocumentSchema,
  campaigns,
  newObjectId,
  type CampaignDocument,
} from '../../app/server/repositories/campaigns';
import { ObjectId } from '../../scripts/graph-db';

/** ObjectIds (and anything that stringifies to 24 hex) become the hex the graph stores. */
function toGraph(value: unknown): unknown {
  if (value instanceof ObjectId) return value.toHexString();
  if (value instanceof Date || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(toGraph);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toGraph(v)]));
}

const hex = (value: unknown): string => {
  const text = value instanceof ObjectId ? value.toHexString() : String(value);
  if (!/^[0-9a-f]{24}$/.test(text)) throw new Error(`Not a campaign id: ${text}`);
  return text;
};

type AsMongo = Omit<CampaignDocument, '_id'> & { _id: ObjectId };
const asMongo = (document: CampaignDocument): AsMongo => ({
  ...document,
  _id: new ObjectId(document._id),
});

type IdFilter = { _id: unknown } | { _id: { $in: unknown[] } };
function idsOf(filter: IdFilter): string[] {
  const id = (filter as { _id: unknown })._id;
  if (id && typeof id === 'object' && '$in' in (id as object))
    return (id as { $in: unknown[] }).$in.map(hex);
  return [hex(id)];
}

function unsupported(what: string): never {
  throw new Error(`campaignFixtures does not support ${what}; add it deliberately`);
}

export const campaignFixtures = {
  async insertOne(document: Record<string, unknown>) {
    const value = campaignDocumentSchema.parse({
      _id: newObjectId(),
      ...(toGraph(document) as object),
    });
    const created = await campaigns.create(value);
    return { acknowledged: true, insertedId: new ObjectId(created._id) };
  },

  async deleteMany(filter: IdFilter) {
    let deletedCount = 0;
    for (const id of idsOf(filter)) if (await campaigns.remove(id)) deletedCount++;
    return { acknowledged: true, deletedCount };
  },

  async deleteOne(filter: IdFilter) {
    return campaignFixtures.deleteMany(filter);
  },

  async findOne(
    filter: { _id?: unknown; gameMasterId?: unknown },
    options: { sort?: { createdAt?: 1 | -1 } } = {}
  ): Promise<AsMongo | null> {
    if (filter._id !== undefined) {
      const found = await campaigns.get(hex(filter._id));
      return found ? asMongo(found) : null;
    }
    if (filter.gameMasterId !== undefined) {
      const owned = (await campaigns.listForUser(hex(filter.gameMasterId))).filter(
        (campaign) => campaign.gameMasterId === hex(filter.gameMasterId)
      );
      const direction = options.sort?.createdAt ?? -1;
      owned.sort((a, b) => direction * (a.createdAt.getTime() - b.createdAt.getTime()));
      return owned[0] ? asMongo(owned[0]) : null;
    }
    return unsupported(`findOne(${JSON.stringify(Object.keys(filter))})`);
  },

  /** Only by exact name, which is how specs find their own leftovers. */
  find(filter: { name?: string }) {
    if (filter.name === undefined) unsupported(`find(${JSON.stringify(Object.keys(filter))})`);
    return {
      async toArray(): Promise<AsMongo[]> {
        return (await campaigns.listAll())
          .filter((campaign) => campaign.name === filter.name)
          .map(asMongo);
      },
    };
  },

  /** Adds a player the way the app does, so the membership index stays correct. */
  async addPlayer(campaignId: unknown, userId: unknown) {
    const { outcome } = await campaigns.addPlayer(hex(campaignId), hex(userId));
    if (outcome !== 'joined' && outcome !== 'already-member')
      throw new Error(`Could not add player to campaign: ${outcome}`);
  },
};
