import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { EntityExistsError } from '../db/graph/entity-store';
import { defineCollection, objectIdString } from './collection';

/**
 * Campaigns, in the graph.
 *
 * Members stay inside the campaign document and remain the authority on who belongs:
 * joining is a compare-and-set on the document, so the player limit is enforced
 * atomically, exactly as MongoDB's conditional update did. Two derived collections make
 * the lookups MongoDB answered with indexes:
 *
 * - `campaignmemberships` answers "which campaigns is this user in". It is an index,
 *   never an authority: results are always checked against the campaign document, so a
 *   stale entry can hide nothing and grant nothing.
 * - `campaigninvitecodes` makes an invite code unique. Its id is derived from the code,
 *   and creating an entity whose id is taken fails atomically — the guarantee MongoDB's
 *   unique index gave.
 */
const scheduleSchema = z
  .object({
    frequency: z.string().nullable().optional(),
    dayOfWeek: z.string().nullable().optional(),
    time: z.string().nullable().optional(),
    timezone: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

export const campaignMemberSchema = z.object({
  userId: objectIdString,
  role: z.enum(['gm', 'player']).default('player'),
  joinedAt: z.date().default(() => new Date()),
});

export const campaignDocumentSchema = z.object({
  _id: objectIdString,
  gameMasterId: objectIdString.nullable().default(null),
  name: z.string(),
  description: z.string().optional(),
  imagePath: z.string().nullable().optional(),
  schedule: scheduleSchema,
  links: z.array(z.object({ name: z.string().optional(), url: z.string().optional() })).default([]),
  maxPlayers: z.number().default(4),
  inviteCode: z.string().optional(),
  status: z.string().default('active'),
  members: z.array(campaignMemberSchema).default([]),
  /**
   * Tooling bookkeeping — `dev-fixtures` marks the campaigns it manages so it can find
   * and destroy them. The application never reads it, but it must survive a round trip.
   */
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});
export type CampaignDocument = z.infer<typeof campaignDocumentSchema>;
export type CampaignMember = z.infer<typeof campaignMemberSchema>;

export const campaignCollection = defineCollection<CampaignDocument>({
  name: 'campaigns',
  kind: 'Campaign',
  schema: campaignDocumentSchema,
  index: { gameMasterId: 'ix_s1', inviteCode: 'ix_s2', status: 'ix_s3', createdAt: 'ix_d1' },
});

const membershipSchema = z.object({
  _id: objectIdString,
  campaignId: objectIdString,
  userId: objectIdString,
});
const membershipCollection = defineCollection<z.infer<typeof membershipSchema>>({
  name: 'campaignmemberships',
  kind: 'CampaignMembership',
  schema: membershipSchema,
  index: { campaignId: 'ix_s1', userId: 'ix_s2' },
});

const inviteCodeSchema = z.object({
  _id: objectIdString,
  code: z.string(),
  campaignId: objectIdString,
});
const inviteCodeCollection = defineCollection<z.infer<typeof inviteCodeSchema>>({
  name: 'campaigninvitecodes',
  kind: 'CampaignInviteCode',
  schema: inviteCodeSchema,
  index: { campaignId: 'ix_s1' },
});

/** A 24-hex id derived from its parts, so the same parts always name the same entity. */
const derivedId = (...parts: string[]) =>
  createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 24);
const membershipId = (campaignId: string, userId: string) =>
  derivedId('membership', campaignId, userId);
const inviteCodeId = (code: string) => derivedId('invite', code);

export const newObjectId = () => randomBytes(12).toString('hex');

/** GMs are implicit members of campaigns they run, including ones with no members list. */
export function isCampaignMember(campaign: CampaignDocument, userId: string): boolean {
  return (
    campaign.members.some((member) => member.userId === userId) || campaign.gameMasterId === userId
  );
}

async function indexMembership(campaignId: string, userId: string): Promise<void> {
  try {
    await membershipCollection.insert({
      _id: membershipId(campaignId, userId),
      campaignId,
      userId,
    });
  } catch (error) {
    // Already indexed: the index is idempotent by construction.
    if (!(error instanceof EntityExistsError)) throw error;
  }
}

export class InviteCodeTakenError extends Error {
  constructor() {
    super('Invite code already in use');
    this.name = 'InviteCodeTakenError';
  }
}

/** Why a join did not happen, when it did not. */
export type JoinOutcome = 'joined' | 'not-found' | 'inactive' | 'already-member' | 'full';

class Unchanged extends Error {}

export const campaigns = {
  get: (id: string) => campaignCollection.get(id),
  getMany: (ids: string[]) => campaignCollection.getMany(ids),
  listAll: () => campaignCollection.findAll(),

  async findByInviteCode(code: string): Promise<CampaignDocument | null> {
    const reservation = await inviteCodeCollection.get(inviteCodeId(code));
    return reservation ? campaignCollection.get(reservation.campaignId) : null;
  },

  /** Campaigns the user runs or belongs to, newest first. */
  async listForUser(userId: string): Promise<CampaignDocument[]> {
    const [memberships, owned] = await Promise.all([
      membershipCollection.findAll({ where: { userId } }),
      campaignCollection.findAll({ where: { gameMasterId: userId } }),
    ]);
    const ids = new Set([...memberships.map((m) => m.campaignId), ...owned.map((c) => c._id)]);
    // The document decides membership; the index only narrows the search.
    return (await campaignCollection.getMany([...ids]))
      .filter((campaign) => isCampaignMember(campaign, userId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  /**
   * Reserves the invite code first, so two campaigns can never share one. If the campaign
   * itself then fails to be written, the reservation is released.
   */
  async create(document: CampaignDocument): Promise<CampaignDocument> {
    const parsed = campaignDocumentSchema.parse(document);
    if (parsed.inviteCode) {
      try {
        await inviteCodeCollection.insert({
          _id: inviteCodeId(parsed.inviteCode),
          code: parsed.inviteCode,
          campaignId: parsed._id,
        });
      } catch (error) {
        if (error instanceof EntityExistsError) throw new InviteCodeTakenError();
        throw error;
      }
    }
    let created: CampaignDocument;
    try {
      created = await campaignCollection.insert(parsed);
    } catch (error) {
      if (parsed.inviteCode) await inviteCodeCollection.remove(inviteCodeId(parsed.inviteCode));
      throw error;
    }
    for (const member of created.members) await indexMembership(created._id, member.userId);
    if (created.gameMasterId) await indexMembership(created._id, created.gameMasterId);
    return created;
  },

  /**
   * Edits a campaign with compare-and-set. Membership and the invite code have their own
   * operations; changing them here would bypass the indexes that keep them findable.
   */
  async update(
    id: string,
    change: (current: CampaignDocument) => CampaignDocument
  ): Promise<CampaignDocument | null> {
    return campaignCollection.update(id, (current) => {
      const next = change(current);
      if (next.inviteCode !== current.inviteCode) throw new Error('Invite codes cannot change');
      if (JSON.stringify(next.members) !== JSON.stringify(current.members))
        throw new Error('Use the membership operations to change members');
      return next;
    });
  },

  /**
   * Adds a player if the campaign is active, the user is not already in it, and there is
   * room — all checked inside one compare-and-set, so two concurrent joins cannot both
   * take the last seat.
   */
  async addPlayer(
    id: string,
    userId: string,
    joinedAt = new Date()
  ): Promise<{ outcome: JoinOutcome; campaign: CampaignDocument | null }> {
    let outcome: JoinOutcome = 'joined';
    let campaign: CampaignDocument | null;
    try {
      campaign = await campaignCollection.update(id, (current) => {
        // A lost race re-runs this against the newer document, so decide afresh each time.
        outcome = 'joined';
        const players = current.members.filter((m) => m.role === 'player').length;
        if (current.status !== 'active') outcome = 'inactive';
        else if (current.members.some((m) => m.userId === userId)) outcome = 'already-member';
        else if (players >= current.maxPlayers) outcome = 'full';
        else
          return {
            ...current,
            members: [...current.members, { userId, role: 'player', joinedAt }],
            updatedAt: new Date(),
          };
        throw new Unchanged();
      });
    } catch (error) {
      if (!(error instanceof Unchanged)) throw error;
      campaign = await campaignCollection.get(id);
    }
    if (!campaign) return { outcome: 'not-found', campaign: null };
    if (outcome === 'joined') await indexMembership(id, userId);
    return { outcome, campaign };
  },

  /**
   * Removes a campaign and the index entries that point at it. Other data scoped to the
   * campaign belongs to its own subsystem and is removed there.
   */
  async remove(id: string): Promise<boolean> {
    const campaign = await campaignCollection.get(id);
    if (!campaign) return false;
    await membershipCollection.removeWhere({ campaignId: id });
    await inviteCodeCollection.removeWhere({ campaignId: id });
    return campaignCollection.remove(id);
  },
};

/** Writes seeded or fixture campaigns, keeping their indexes consistent. */
export async function insertCampaignDocuments(documents: CampaignDocument[]): Promise<void> {
  for (const document of documents) await campaigns.create(document);
}

export { membershipCollection as campaignMembershipCollection };
export { inviteCodeCollection as campaignInviteCodeCollection };
