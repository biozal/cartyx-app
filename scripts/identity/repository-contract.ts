import assert from 'node:assert/strict';
import type {
  CampaignAccessRepository,
  IdentityRepository,
  RecordIdentityLogin,
} from '../../app/server/repositories/identity/types';

/** Adapter-independent behavior checks. Fixture reads/writes belong to the harness. */
export async function identityRepositoryContract(harness: {
  identity: IdentityRepository;
  access: CampaignAccessRepository;
  seedUser(document: Record<string, unknown>): Promise<string>;
  readUser(id: string): Promise<Record<string, unknown>>;
  isConflict(error: unknown): boolean;
  countUsers(providerId: string): Promise<number>;
  seedCampaign(userId: string): Promise<string>;
  revokeMembership(campaignId: string): Promise<void>;
}) {
  const { identity, access } = harness;
  const login = (providerId: string, email?: string): RecordIdentityLogin => ({
    providerId,
    provider: 'fixture',
    ...(email && { email }),
    oauthTokens: {
      accessToken: { ciphertext: 'cipher', iv: 'iv', authTag: 'tag' },
      refreshToken: null,
    },
    lastLoginAt: new Date('2026-09-13T00:00:00.000Z'),
  });

  assert.equal(await identity.findProfile('missing'), null);
  assert.equal(await identity.findUserId('missing'), null);
  assert.equal(await identity.readDisplayName('000000000000000000000000'), null);
  assert.equal(await identity.lookupAudioStoragePrefix('000000000000000000000000'), null);
  await assert.rejects(
    identity.resolveAudioStoragePrefix('000000000000000000000000'),
    /User not found/
  );
  assert.equal(await identity.readAccessToken('missing'), null);
  assert.equal(await identity.readPreferences('missing'), null);
  // Preserve updateOne semantics: these operations do not upsert missing users.
  await identity.setRulerColor('missing', '#123456');
  await identity.clearTokens('missing');
  assert.equal(await harness.countUsers('missing'), 0);

  const fresh = await identity.recordLogin(login('fixture_new', 'New@Example.invalid'));
  assert.match(fresh.id, /^[0-9a-f]{24}$/);
  assert.equal(fresh.role, 'unknown');
  assert.equal(fresh.email, 'New@Example.invalid');
  assert.equal(await identity.findUserId('fixture_new'), fresh.id);
  assert.equal(await identity.findProfile('FIXTURE_NEW'), null);
  const freshRaw = await harness.readUser(fresh.id);
  assert.deepEqual(freshRaw.createdAt, login('unused').lastLoginAt);
  assert.deepEqual(freshRaw.lastLoginAt, login('unused').lastLoginAt);
  assert.ok(!Object.hasOwn(freshRaw, 'audioStoragePrefix'));

  const seeded = await harness.seedUser({
    email: 'claim@example.invalid',
    firstName: 'Keep',
    lastName: 'Name',
    role: 'gm',
    avatarUrl: 'https://example.invalid/avatar',
    preferences: { rulerColor: '#112233', future: true },
    audioStoragePrefix: 'a'.repeat(32),
    campaigns: [],
    createdAt: new Date('2020-01-01'),
    legacy: { nested: [null, 'preserve'] },
  });
  const before = await harness.readUser(seeded);
  const claimed = await identity.recordLogin(login('fixture_claim', 'claim@example.invalid'));
  assert.equal(claimed.id, seeded);
  assert.equal(claimed.role, 'gm');
  assert.equal(claimed.firstName, 'Keep');
  assert.equal(claimed.lastName, 'Name');
  assert.equal(claimed.avatarUrl, 'https://example.invalid/avatar');
  assert.deepEqual(await identity.readDisplayName(seeded), {
    firstName: 'Keep',
    lastName: 'Name',
    email: 'claim@example.invalid',
  });
  assert.equal(await identity.lookupAudioStoragePrefix(seeded), 'a'.repeat(32));
  assert.equal(await identity.resolveAudioStoragePrefix(seeded), 'a'.repeat(32));
  const after = await harness.readUser(seeded);
  for (const key of ['createdAt', 'campaigns', 'preferences', 'audioStoragePrefix', 'legacy']) {
    assert.deepEqual(after[key], before[key]);
  }
  assert.deepEqual(
    await identity.readAccessToken('fixture_claim'),
    login('unused').oauthTokens.accessToken
  );
  for (const value of [claimed, await identity.findProfile('fixture_claim')]) {
    assert.ok(value);
    assert.deepEqual(
      Object.keys(value).sort(),
      ['id', 'email', 'firstName', 'lastName', 'avatarUrl', 'role'].sort()
    );
    assert.ok(!JSON.stringify(value).includes('cipher'));
    assert.ok(!JSON.stringify(value).includes('a'.repeat(32)));
  }

  // A returning login preserves identity/role and omitted profile fields. A
  // structurally wider caller cannot overwrite operational fields via login.
  const widerInput = {
    ...login('fixture_claim'),
    role: 'player',
    audioStoragePrefix: 'b'.repeat(32),
    preferences: {},
    campaigns: [],
  };
  const returning = await identity.recordLogin(widerInput);
  assert.equal(returning.id, seeded);
  assert.equal(returning.role, 'gm');
  assert.equal(returning.email, 'claim@example.invalid');
  assert.deepEqual((await harness.readUser(seeded)).preferences, before.preferences);
  assert.equal((await harness.readUser(seeded)).audioStoragePrefix, before.audioStoragePrefix);

  await identity.setRulerColor('fixture_claim', '#abcdef');
  assert.deepEqual(await identity.readPreferences('fixture_claim'), { rulerColor: '#abcdef' });
  assert.deepEqual((await harness.readUser(seeded)).preferences, {
    rulerColor: '#abcdef',
    future: true,
  });
  await identity.clearTokens('fixture_claim');
  assert.equal(await identity.readAccessToken('fixture_claim'), null);
  assert.ok(!Object.hasOwn(await harness.readUser(seeded), 'oauthTokens'));
  assert.equal(await identity.findUserId('fixture_claim'), seeded);

  // Exact email matches cannot hijack an already bound account. Failures must
  // propagate so the caller cannot mint a session for a nonexistent account.
  await assert.rejects(
    identity.recordLogin(login('fixture_other', 'claim@example.invalid')),
    harness.isConflict
  );
  assert.equal(await identity.findUserId('fixture_other'), null);
  assert.equal(await identity.findUserId('fixture_claim'), seeded);

  const explicitNull = await harness.seedUser({
    email: 'null@example.invalid',
    providerId: null,
    role: 'player',
  });
  assert.equal(
    (await identity.recordLogin(login('fixture_null', 'null@example.invalid'))).id,
    explicitNull
  );

  for (const kind of ['new', 'claim'] as const) {
    const providerId = `fixture_concurrent_${kind}`;
    const email = `${providerId}@example.invalid`;
    const originalId =
      kind === 'claim'
        ? await harness.seedUser({ email, role: 'player', audioStoragePrefix: 'c'.repeat(32) })
        : undefined;
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => identity.recordLogin(login(providerId, email)))
    );
    for (const result of results)
      if (result.status === 'rejected') {
        assert.ok(
          harness.isConflict(result.reason),
          'Concurrent login may reject a uniqueness conflict only'
        );
      }
    const successful = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : []
    );
    assert.ok(successful.length > 0);
    assert.equal(new Set(successful.map((result) => result.id)).size, 1);
    assert.equal(await harness.countUsers(providerId), 1);
    const persisted = await identity.findProfile(providerId);
    assert.ok(persisted);
    assert.equal(successful[0].id, persisted.id);
    if (originalId) {
      assert.equal(persisted.id, originalId);
      assert.equal(persisted.role, 'player');
      assert.equal((await harness.readUser(originalId)).audioStoragePrefix, 'c'.repeat(32));
    }
    // The existing Mongo algorithm can reject a losing unique-index race. It
    // does not retry uncertain writes. A subsequent explicit login reconciles.
    assert.equal((await identity.recordLogin(login(providerId, email))).id, persisted.id);
  }

  const campaignId = await harness.seedCampaign(seeded);
  assert.deepEqual(await access.findAccess(campaignId), {
    gameMasterId: seeded,
    members: [{ userId: seeded, role: 'gm' }],
  });
  await harness.revokeMembership(campaignId);
  assert.deepEqual(await access.findAccess(campaignId), { gameMasterId: null, members: [] });
  assert.equal(await access.findAccess('000000000000000000000000'), null);

  const namespaces = new Set<string>(['a'.repeat(32), 'c'.repeat(32)]);
  for (const state of ['missing', 'null'] as const) {
    const ownerId = await harness.seedUser({
      role: 'player',
      ...(state === 'null' && { audioStoragePrefix: null }),
      legacy: { keep: true },
    });
    const original = await harness.readUser(ownerId);
    assert.equal(await identity.lookupAudioStoragePrefix(ownerId), null);
    assert.deepEqual(await harness.readUser(ownerId), original); // A scan cannot mint a prefix.
    const prefixes = await Promise.all(
      Array.from({ length: 12 }, () => identity.resolveAudioStoragePrefix(ownerId))
    );
    assert.equal(new Set(prefixes).size, 1);
    assert.match(prefixes[0], /^[0-9a-f]{32}$/);
    assert.ok(!namespaces.has(prefixes[0]));
    namespaces.add(prefixes[0]);
    assert.equal((await harness.readUser(ownerId)).audioStoragePrefix, prefixes[0]);
    assert.equal(await identity.resolveAudioStoragePrefix(ownerId), prefixes[0]);
    assert.deepEqual((await harness.readUser(ownerId)).legacy, { keep: true });
  }
}
