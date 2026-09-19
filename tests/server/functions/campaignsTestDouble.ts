import { vi } from 'vitest';
import type { CampaignDocument, JoinOutcome } from '~/server/repositories/campaigns';

/**
 * Stands in for `~/server/repositories/campaigns` in server-function tests:
 *
 *   vi.mock('~/server/repositories/campaigns', () => import('./campaignsTestDouble'));
 *
 * then program `campaigns.get` and friends per test. Campaigns moved to the graph, so a
 * test no longer mocks the Mongoose model; it stubs the repository the functions call.
 * The repository's own behaviour — invite-code uniqueness, the player limit under
 * concurrent joins, the membership index — is tested against the in-memory store in
 * `tests/server/repositories/campaigns.test.ts`, and against real JanusGraph by the
 * repository integration script.
 */
/**
 * Fixtures describe only the fields a test cares about — often no `joinedAt`, sometimes a
 * loosely typed role — as they did when they stubbed the Mongoose model.
 */
type Member = { userId: unknown; role?: string; joinedAt?: Date };
type Doc = Omit<Partial<CampaignDocument>, 'members'> & { members?: Member[] } & Record<
    string,
    unknown
  >;

export const campaigns = {
  get: vi.fn(async (_id: string): Promise<Doc | null> => null),
  getMany: vi.fn(async (_ids: string[]): Promise<Doc[]> => []),
  listAll: vi.fn(async (): Promise<Doc[]> => []),
  findByInviteCode: vi.fn(async (_code: string): Promise<Doc | null> => null),
  listForUser: vi.fn(async (_userId: string): Promise<Doc[]> => []),
  create: vi.fn(async (document: Doc) => document),
  update: vi.fn(async (_id: string, _change: (current: Doc) => Doc): Promise<Doc | null> => null),
  addPlayer: vi.fn(
    async (
      _id: string,
      _userId: string,
      _joinedAt?: Date
    ): Promise<{ outcome: JoinOutcome; campaign: Doc | null }> => ({
      outcome: 'not-found',
      campaign: null,
    })
  ),
  remove: vi.fn(async (_id: string) => true),
};

/**
 * `update` applies the caller's change to whatever `get` currently returns, the way the
 * real compare-and-set does, so a test asserts on the document the function produced.
 */
export function applyUpdatesToGet() {
  campaigns.update.mockImplementation(async (id, change) => {
    const current = await campaigns.get(id);
    return current ? change(current) : null;
  });
}

const actual = await vi.importActual<typeof import('~/server/repositories/campaigns')>(
  '~/server/repositories/campaigns'
);
export const { isCampaignMember, InviteCodeTakenError } = actual;
/** Real by default; a test pins it to make the minted campaign id predictable. */
export const newObjectId = vi.fn(() => actual.newObjectId());
