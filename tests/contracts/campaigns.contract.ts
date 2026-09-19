import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  campaignMembershipCollection,
  campaigns,
  InviteCodeTakenError,
  type CampaignDocument,
} from '~/server/repositories/campaigns';

/**
 * What the campaigns repository must guarantee, run against the in-memory store in unit
 * tests and against real JanusGraph by `scripts/graph/repositories-integration.ts`. The
 * store has diverged from the in-memory one before, so the properties that replaced
 * MongoDB indexes are proven on both: invite-code uniqueness, the player limit under
 * concurrent joins, and a membership index that can never grant access on its own.
 *
 * Every id is fresh, and everything created is removed at the end, so it can run
 * against a shared development graph.
 */
const id = () => randomBytes(12).toString('hex');

export async function campaignsContract() {
  const gm = id();
  const created: string[] = [];
  const campaign = (overrides: Partial<CampaignDocument> = {}): CampaignDocument => ({
    _id: id(),
    gameMasterId: gm,
    name: 'Contract Campaign',
    links: [],
    maxPlayers: 2,
    inviteCode: `CONTRACT-${id()}`,
    status: 'active',
    members: [{ userId: gm, role: 'gm', joinedAt: new Date(0) }],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  const create = async (document: CampaignDocument) => {
    const result = await campaigns.create(document);
    created.push(result._id);
    return result;
  };

  try {
    // Create, read by id and by invite code.
    const first = await create(campaign({ createdAt: new Date(1000) }));
    assert.equal((await campaigns.get(first._id))?.name, 'Contract Campaign');
    assert.equal((await campaigns.findByInviteCode(first.inviteCode!))?._id, first._id);

    // A taken invite code is refused, and the refusal takes nothing from its owner.
    const clash = campaign({ inviteCode: first.inviteCode });
    await assert.rejects(campaigns.create(clash), InviteCodeTakenError);
    assert.equal(await campaigns.get(clash._id), null);
    assert.equal((await campaigns.findByInviteCode(first.inviteCode!))?._id, first._id);

    // Membership: members and the GM see it; the index alone grants nothing.
    const player = id();
    const outsider = id();
    assert.equal((await campaigns.addPlayer(first._id, player)).outcome, 'joined');
    assert.deepEqual(
      (await campaigns.listForUser(player)).map((c) => c._id),
      [first._id]
    );
    await campaignMembershipCollection.insert({
      _id: id(),
      campaignId: first._id,
      userId: outsider,
    });
    assert.deepEqual(await campaigns.listForUser(outsider), []);
    const second = await create(campaign({ createdAt: new Date(2000) }));
    assert.deepEqual(
      (await campaigns.listForUser(gm)).map((c) => c._id),
      [second._id, first._id],
      'newest first'
    );

    // Four campaigns racing for one fresh code: exactly one gets it.
    const code = `CONTRACT-${id()}`;
    const racers = await Promise.allSettled(
      Array.from({ length: 4 }, () => create(campaign({ inviteCode: code })))
    );
    assert.equal(racers.filter((r) => r.status === 'fulfilled').length, 1);
    for (const r of racers)
      if (r.status === 'rejected' && !(r.reason instanceof InviteCodeTakenError)) throw r.reason;

    // Five concurrent joins for the two seats of a fresh campaign: exactly two win.
    const contested = await create(campaign({ maxPlayers: 2 }));
    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () => campaigns.addPlayer(contested._id, id()))
    );
    assert.equal(outcomes.filter((o) => o.outcome === 'joined').length, 2);
    assert.equal(outcomes.filter((o) => o.outcome === 'full').length, 3);
    assert.equal(
      (await campaigns.get(contested._id))?.members.filter((m) => m.role === 'player').length,
      2
    );

    // Removal takes the indexes with it.
    assert.equal(await campaigns.remove(first._id), true);
    assert.equal(await campaigns.get(first._id), null);
    assert.equal(await campaigns.findByInviteCode(first.inviteCode!), null);
    assert.deepEqual(await campaigns.listForUser(player), []);
  } finally {
    // Removing a campaign removes every index entry pointing at it, planted ones included.
    for (const campaignId of created) await campaigns.remove(campaignId);
  }
}
