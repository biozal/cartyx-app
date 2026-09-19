import { describe, expect, it } from 'vitest';
import { loreSchema } from '~/server/db/models/Lore';
import { questSchema } from '~/server/db/models/Quest';
import { organizationSchema } from '~/server/db/models/Organization';
import { organizationMembershipSchema } from '~/server/db/models/OrganizationMembership';

/**
 * The graph schemas that replaced these Mongoose schemas must keep their defaults,
 * enums and required fields, since server functions and stored documents rely on them.
 */
const ID = '507f1f77bcf86cd799439011';
const base = { _id: ID, campaignId: ID, createdBy: ID };

describe('Lore schema', () => {
  it('fills the Mongoose defaults', () => {
    const lore = loreSchema.parse({ ...base, title: 'Old Owl Well' });
    expect(lore).toMatchObject({
      content: '',
      gmContent: '',
      isPublic: false,
      images: [],
      links: [],
      tags: [],
    });
    expect(lore.createdAt).toBeInstanceOf(Date);
  });

  it('links require a kind from the enum and an id', () => {
    expect(
      loreSchema.safeParse({ ...base, title: 'T', links: [{ kind: 'race', id: ID }] }).success
    ).toBe(true);
    expect(
      loreSchema.safeParse({ ...base, title: 'T', links: [{ kind: 'spell', id: ID }] }).success
    ).toBe(false);
    expect(loreSchema.safeParse({ ...base, title: 'T', links: [{ kind: 'race' }] }).success).toBe(
      false
    );
  });
});

describe('Quest schema', () => {
  it('defaults status, visibility, giver and parent', () => {
    const quest = questSchema.parse({ ...base, name: 'Goblin Arrows' });
    expect(quest).toMatchObject({
      status: 'not_started',
      isPublic: false,
      giver: null,
      parentQuestId: null,
      links: [],
      events: [],
    });
  });

  it('rejects an unknown status', () => {
    expect(questSchema.safeParse({ ...base, name: 'X', status: 'bogus' }).success).toBe(false);
  });

  it('accepts embedded links and events with role and notes', () => {
    const quest = questSchema.parse({
      ...base,
      name: 'X',
      links: [{ kind: 'character', id: ID, role: 'Target', publicInfo: 'p', privateInfo: 'g' }],
      events: [{ eventId: ID, role: 'Started at' }],
    });
    expect(quest.links[0].role).toBe('Target');
    expect(quest.events[0]).toMatchObject({ role: 'Started at', publicInfo: '', privateInfo: '' });
  });
});

describe('Organization schema', () => {
  it('fills the defaults and requires a locationId on location links', () => {
    expect(organizationSchema.parse({ ...base, name: 'Zhentarim' })).toMatchObject({
      publicInfo: '',
      privateInfo: '',
      isPublic: false,
      locations: [],
    });
    expect(
      organizationSchema.safeParse({ ...base, name: 'Z', locations: [{ publicInfo: 'x' }] }).success
    ).toBe(false);
  });
});

describe('OrganizationMembership schema', () => {
  it('memberKind is a required player|character enum', () => {
    const membership = { ...base, organizationId: ID, memberId: ID };
    expect(
      organizationMembershipSchema.safeParse({ ...membership, memberKind: 'player' }).success
    ).toBe(true);
    expect(
      organizationMembershipSchema.safeParse({ ...membership, memberKind: 'npc' }).success
    ).toBe(false);
    expect(organizationMembershipSchema.safeParse(membership).success).toBe(false);
  });
});
