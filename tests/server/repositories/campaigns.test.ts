// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/server/repositories/entity-store', () => import('../functions/entityStoreDouble'));
import { resetEntityStore } from '../functions/entityStoreDouble';
import { campaignsContract } from '../../contracts/campaigns.contract';
import {
  campaignMembershipCollection,
  campaigns,
  InviteCodeTakenError,
  type CampaignDocument,
} from '~/server/repositories/campaigns';

const hex = (n: number) => n.toString(16).padStart(24, '0');
const GM = hex(100);
const PLAYER = hex(101);
const OTHER = hex(102);

const campaign = (n: number, overrides: Partial<CampaignDocument> = {}): CampaignDocument => ({
  _id: hex(n),
  gameMasterId: GM,
  name: `Campaign ${n}`,
  links: [],
  maxPlayers: 2,
  inviteCode: `CODE-${n}`,
  status: 'active',
  members: [{ userId: GM, role: 'gm', joinedAt: new Date(0) }],
  createdAt: new Date(n * 1000),
  updatedAt: new Date(n * 1000),
  ...overrides,
});

beforeEach(() => resetEntityStore());

describe('campaigns repository', () => {
  it('creates a campaign and finds it by id and by invite code', async () => {
    await campaigns.create(campaign(1));
    expect((await campaigns.get(hex(1)))?.name).toBe('Campaign 1');
    expect((await campaigns.findByInviteCode('CODE-1'))?._id).toBe(hex(1));
    expect(await campaigns.findByInviteCode('NOPE')).toBeNull();
  });

  it('never lets two campaigns share an invite code', async () => {
    await campaigns.create(campaign(1));
    await expect(campaigns.create(campaign(2, { inviteCode: 'CODE-1' }))).rejects.toBeInstanceOf(
      InviteCodeTakenError
    );
    expect(await campaigns.get(hex(2))).toBeNull();
    // The failed attempt did not take the code from its owner.
    expect((await campaigns.findByInviteCode('CODE-1'))?._id).toBe(hex(1));
  });

  it('releases the invite code when the campaign itself cannot be written', async () => {
    await campaigns.create(campaign(1));
    // Same _id, fresh code: the code is reserved, then the campaign insert fails.
    await expect(campaigns.create(campaign(1, { inviteCode: 'CODE-FRESH' }))).rejects.toThrow();
    expect(await campaigns.findByInviteCode('CODE-FRESH')).toBeNull();
    await campaigns.create(campaign(3, { inviteCode: 'CODE-FRESH' }));
    expect((await campaigns.findByInviteCode('CODE-FRESH'))?._id).toBe(hex(3));
  });

  it('lists the campaigns a user runs or belongs to, newest first', async () => {
    await campaigns.create(campaign(1));
    await campaigns.create(campaign(2, { gameMasterId: OTHER, members: [] }));
    await campaigns.create(
      campaign(3, {
        gameMasterId: OTHER,
        members: [{ userId: PLAYER, role: 'player', joinedAt: new Date(0) }],
      })
    );
    // A legacy campaign with no members list is still its GM's.
    await campaigns.create(campaign(4, { members: [] }));

    expect((await campaigns.listForUser(GM)).map((c) => c._id)).toEqual([hex(4), hex(1)]);
    expect((await campaigns.listForUser(PLAYER)).map((c) => c._id)).toEqual([hex(3)]);
    expect(await campaigns.listForUser(hex(999))).toEqual([]);
  });

  it('never shows a campaign on the strength of a stale index entry', async () => {
    await campaigns.create(campaign(1));
    // Index says OTHER belongs; the campaign document says otherwise.
    await campaignMembershipCollection.insert({ _id: hex(500), campaignId: hex(1), userId: OTHER });
    expect(await campaigns.listForUser(OTHER)).toEqual([]);
  });

  it('adds a player, and reports why when it cannot', async () => {
    await campaigns.create(campaign(1));
    const joined = await campaigns.addPlayer(hex(1), PLAYER);
    expect(joined.outcome).toBe('joined');
    expect(joined.campaign?.members.map((m) => m.userId)).toEqual([GM, PLAYER]);
    expect((await campaigns.listForUser(PLAYER)).map((c) => c._id)).toEqual([hex(1)]);

    expect((await campaigns.addPlayer(hex(1), PLAYER)).outcome).toBe('already-member');
    expect((await campaigns.addPlayer(hex(9), PLAYER)).outcome).toBe('not-found');

    await campaigns.create(campaign(2, { status: 'archived' }));
    expect((await campaigns.addPlayer(hex(2), PLAYER)).outcome).toBe('inactive');
  });

  it('never seats more players than the campaign allows, even when joins race', async () => {
    await campaigns.create(campaign(1, { maxPlayers: 2 }));
    const joiners = [hex(201), hex(202), hex(203), hex(204), hex(205)];
    const results = await Promise.all(joiners.map((user) => campaigns.addPlayer(hex(1), user)));
    expect(results.filter((r) => r.outcome === 'joined')).toHaveLength(2);
    expect(results.filter((r) => r.outcome === 'full')).toHaveLength(3);
    const stored = await campaigns.get(hex(1));
    expect(stored?.members.filter((m) => m.role === 'player')).toHaveLength(2);
  });

  it('edits a campaign but keeps membership and the invite code to their own operations', async () => {
    await campaigns.create(campaign(1));
    const updated = await campaigns.update(hex(1), (c) => ({ ...c, name: 'Renamed' }));
    expect(updated?.name).toBe('Renamed');
    await expect(campaigns.update(hex(1), (c) => ({ ...c, inviteCode: 'STOLEN' }))).rejects.toThrow(
      /Invite codes/
    );
    await expect(campaigns.update(hex(1), (c) => ({ ...c, members: [] }))).rejects.toThrow(
      /membership/
    );
  });

  it('removes a campaign together with the entries that pointed at it', async () => {
    await campaigns.create(campaign(1));
    await campaigns.addPlayer(hex(1), PLAYER);
    expect(await campaigns.remove(hex(1))).toBe(true);
    expect(await campaigns.get(hex(1))).toBeNull();
    expect(await campaigns.findByInviteCode('CODE-1')).toBeNull();
    expect(await campaigns.listForUser(PLAYER)).toEqual([]);
    expect(await campaigns.remove(hex(1))).toBe(false);
  });

  it('satisfies the shared campaigns contract in memory', async () => {
    await campaignsContract();
  });
});
