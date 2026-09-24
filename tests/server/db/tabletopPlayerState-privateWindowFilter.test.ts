// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/server/repositories/entity-store', () => import('../functions/entityStoreDouble'));
import { resetEntityStore } from '../functions/entityStoreDouble';
import { TabletopPlayerState } from '~/server/db/models/TabletopPlayerState';

/**
 * `addPrivateWindow` enforces dedup and the per-screen cap inside its updateOne FILTER
 * (`$nor` + `$expr`) rather than from a read-then-write, because two concurrent calls
 * both read the array before either write lands. The rest of the suite mocks the model,
 * so nothing there ever evaluates that filter — and a filter that matches wrongly fails
 * open, with no error. These tests run the exact shape against the real graph model.
 */
const CAMPAIGN_ID = '65c0000000000000000000c1';
const USER_ID = '65c0000000000000000000a1';
const SCREEN_ID = '65c0000000000000000000e1';
const CAP = 3;

/** The filter addPrivateWindow builds, for one window. */
function addFilter(documentId: string) {
  return {
    campaignId: CAMPAIGN_ID,
    userId: USER_ID,
    $nor: [
      {
        privateWindows: {
          $elemMatch: { surface: 'tabletop', screenId: SCREEN_ID, collection: 'lore', documentId },
        },
      },
    ],
    $expr: {
      $lt: [
        {
          $size: {
            $filter: {
              input: { $ifNull: ['$privateWindows', []] },
              cond: {
                $and: [
                  { $eq: ['$$this.surface', 'tabletop'] },
                  { $eq: ['$$this.screenId', SCREEN_ID] },
                ],
              },
            },
          },
        },
        CAP,
      ],
    },
  };
}

const add = (documentId: string) =>
  TabletopPlayerState.updateOne(addFilter(documentId), {
    $push: {
      privateWindows: { surface: 'tabletop', screenId: SCREEN_ID, collection: 'lore', documentId },
    },
  });

const doc = (n: number) => `65c00000000000000000f${n.toString(16).padStart(3, '0')}`;

beforeEach(async () => {
  resetEntityStore();
  await TabletopPlayerState.create({ campaignId: CAMPAIGN_ID, userId: USER_ID });
});

const windows = async () =>
  (await TabletopPlayerState.findOne({ campaignId: CAMPAIGN_ID, userId: USER_ID }).lean())!
    .privateWindows;

describe('addPrivateWindow dedup/cap filter against the graph model', () => {
  it('adds a window, with its own id', async () => {
    expect((await add(doc(1))).modifiedCount).toBe(1);
    expect(await windows()).toEqual([
      expect.objectContaining({ documentId: doc(1), _id: expect.stringMatching(/^[0-9a-f]{24}$/) }),
    ]);
  });

  it('does not add the same window twice, even when the adds race', async () => {
    await Promise.all([add(doc(1)), add(doc(1)), add(doc(1))]);
    expect(await windows()).toHaveLength(1);
  });

  it('stops at the cap, even when the adds race', async () => {
    await Promise.all(Array.from({ length: 6 }, (_, n) => add(doc(n))));
    expect(await windows()).toHaveLength(CAP);
  });

  it('counts only this surface and screen against the cap', async () => {
    await TabletopPlayerState.updateOne(
      { campaignId: CAMPAIGN_ID, userId: USER_ID },
      {
        $push: {
          privateWindows: {
            surface: 'gmscreen',
            screenId: SCREEN_ID,
            collection: 'lore',
            documentId: doc(99),
          },
        },
      }
    );
    for (let n = 0; n < CAP; n++) expect((await add(doc(n))).modifiedCount).toBe(1);
    expect(await windows()).toHaveLength(CAP + 1);
  });

  it('rejects a surface outside the enum', async () => {
    await expect(
      TabletopPlayerState.updateOne(
        { campaignId: CAMPAIGN_ID, userId: USER_ID },
        {
          $push: {
            privateWindows: {
              surface: 'sidebar',
              screenId: SCREEN_ID,
              collection: 'lore',
              documentId: doc(1),
            },
          },
        }
      )
    ).rejects.toThrow();
  });
});
