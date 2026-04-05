import { describe, expect, it } from 'vitest';
import { getSessions, mockSessionsService } from '~/services/mocks/sessionsService';

describe('mockSessionsService', () => {
  it('returns campaign session summaries in descending order', async () => {
    const sessions = await getSessions();

    expect(sessions.length).toBeGreaterThan(3);
    expect(sessions[0]).toMatchObject({
      number: 14,
      name: 'Ashes at Emberfall',
    });
    expect(sessions[1]!.number).toBeLessThan(sessions[0]!.number);
  });

  it('uses the consistent service interface', async () => {
    await expect(mockSessionsService.getSessions()).resolves.toEqual(await getSessions());
  });

  it('returns defensive copies', async () => {
    const first = await getSessions();
    const second = await getSessions();

    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);

    first[0]!.name = 'Mutated';
    expect((await getSessions())[0]!.name).toBe('Ashes at Emberfall');
  });
});
