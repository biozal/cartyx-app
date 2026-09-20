// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { byCollection, parsePlan, persistPlan, PlanId } from '../../scripts/seed/plan';

const id = 'a'.repeat(24);

describe('seed plan', () => {
  it('revives ids and dates the Python builder wrote as extended JSON', () => {
    const [entry] = parsePlan(
      JSON.stringify([
        {
          collection: 'campaigns',
          document: {
            _id: { $oid: id },
            createdAt: { $date: '2026-09-19T12:00:00Z' },
            members: [
              { userId: { $oid: 'b'.repeat(24) }, joinedAt: { $date: { $numberLong: '0' } } },
            ],
            name: 'Phandelver',
            maxPlayers: 5,
          },
        },
      ])
    );
    expect(entry!.collection).toBe('campaigns');
    expect(entry!.document._id).toBeInstanceOf(PlanId);
    expect(String(entry!.document._id)).toBe(id);
    expect(entry!.document.createdAt).toEqual(new Date('2026-09-19T12:00:00Z'));
    const [member] = entry!.document.members as { userId: PlanId; joinedAt: Date }[];
    expect(member!.userId.hex).toBe('b'.repeat(24));
    expect(member!.joinedAt).toEqual(new Date(0));
  });

  it('refuses extended JSON it does not understand rather than storing it as data', () => {
    for (const document of [
      { value: { $numberDecimal: '1.5' } },
      { value: { $oid: 'not-hex' } },
      { value: { $date: 'not a date' } },
      { value: { $where: 'sleep(1000)' } },
    ])
      expect(() => parsePlan(JSON.stringify([{ collection: 'x', document }]))).toThrow();
    expect(() => parsePlan('{"collection":"x"}')).toThrow(/list/);
  });

  it('keeps each collection in plan order', () => {
    const grouped = byCollection([
      { collection: 'a', document: { n: 1 } },
      { collection: 'b', document: { n: 2 } },
      { collection: 'a', document: { n: 3 } },
    ]);
    expect(grouped.get('a')).toEqual([{ n: 1 }, { n: 3 }]);
    expect(grouped.get('b')).toEqual([{ n: 2 }]);
  });

  it('sends each collection to its graph route', async () => {
    const write = vi.fn(async () => {});
    const summary = await persistPlan(
      [
        { collection: 'campaigns', document: { n: 1 } },
        { collection: 'campaigns', document: { n: 2 } },
      ],
      { campaigns: write }
    );
    expect(write).toHaveBeenCalledWith([{ n: 1 }, { n: 2 }]);
    expect(summary).toEqual({ campaigns: 2 });
  });

  it('refuses a collection with no graph route before writing anything', async () => {
    const write = vi.fn(async () => {});
    await expect(
      persistPlan(
        [
          { collection: 'campaigns', document: { n: 1 } },
          { collection: 'mystery', document: { n: 2 } },
        ],
        { campaigns: write }
      )
    ).rejects.toThrow(/mystery/);
    expect(write).not.toHaveBeenCalled();
  });
});
