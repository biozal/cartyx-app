import { describe, expect, it } from 'vitest';
import { getPartyMembers, mockPartyMembersService } from '~/services/mocks/partyMembersService';

describe('mockPartyMembersService', () => {
  it('returns D&D party members with avatars and ancestry details', async () => {
    const members = await getPartyMembers();

    expect(members).toHaveLength(5);
    expect(members[0]).toMatchObject({
      name: 'Thorne Ironheart',
      characterClass: 'Paladin',
      race: 'Dwarf',
    });
  });

  it('returns defensive copies', async () => {
    const first = await getPartyMembers();
    const second = await getPartyMembers();

    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);

    first[0]!.name = 'Mutated';
    expect((await getPartyMembers())[0]!.name).toBe('Thorne Ironheart');
  });

  it('uses the consistent service interface', async () => {
    await expect(mockPartyMembersService.getPartyMembers()).resolves.toEqual(
      await getPartyMembers()
    );
  });
});
