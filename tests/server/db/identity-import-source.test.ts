// @vitest-environment node
import { expect, it, vi } from 'vitest';
vi.unmock('mongoose');
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { mapIdentitySource, IdentityMappingError } from '../../../scripts/identity/import-source';
import { importSourceFixture } from '../../../scripts/identity/import-contract';
import { createIdentityImporter } from '../../../scripts/identity/import-account';
const { BSON } = mongoose.mongo;

it('maps original IDs, exact identities, ciphertext, media and timestamps without mutating BSON', () => {
  const raw = Buffer.from(importSourceFixture());
  const original = Buffer.from(raw);
  const source = BSON.deserialize(raw);
  const plan = mapIdentitySource(raw);
  expect(raw).toEqual(original);
  expect(plan.sourceSha256).toBe(createHash('sha256').update(original).digest('hex'));
  expect(plan.account.userId).toBe(source._id.toHexString());
  expect(plan.account.binding).toEqual({
    provider: source.provider,
    providerId: source.providerId,
  });
  expect(plan.account.email).toBe(source.email);
  expect(plan.account.audioStoragePrefix).toBe(source.audioStoragePrefix);
  expect(plan.account.tokens).toEqual(source.oauthTokens);
  expect(plan.snapshot.content).toEqual({
    firstName: source.firstName,
    lastName: null,
    avatarUrl: null,
    role: 'gm',
    rulerColor: '#aBc123',
    createdAt: source.createdAt.toISOString(),
    lastLoginAt: source.lastLoginAt.toISOString(),
  });
  expect(JSON.stringify(plan.snapshot)).not.toContain(source.email);
  expect(JSON.stringify(plan.snapshot)).not.toContain(source.oauthTokens.accessToken.ciphertext);
});

it('maps absent accounts without inventing bindings, tokens, timestamps, media or defaults', () => {
  const raw = BSON.serialize({ _id: new BSON.ObjectId() });
  const plan = mapIdentitySource(raw);
  expect(plan.account).toMatchObject({
    binding: null,
    tokens: null,
    email: null,
    audioStoragePrefix: null,
  });
  expect(Object.values(plan.snapshot.content).every((value) => value === null)).toBe(true);
  const emailOnly = mapIdentitySource(
    BSON.serialize({ _id: new BSON.ObjectId(), email: 'Exact@Example.invalid' })
  );
  expect(emailOnly.account.binding).toBeNull();
  expect(emailOnly.account.email).toBe('Exact@Example.invalid');
  const boundWithoutTokens = mapIdentitySource(
    BSON.serialize({ _id: new BSON.ObjectId(), provider: 'fixture', providerId: 'fixture_empty' })
  );
  expect(boundWithoutTokens.account.tokens).toBeNull();
  // The target read projection uses null; the source digest still distinguishes missing/null.
  const explicitNull = mapIdentitySource(
    BSON.serialize({ _id: new BSON.ObjectId(plan.account.userId), firstName: null })
  );
  expect(explicitNull.snapshot.content).toEqual(plan.snapshot.content);
  expect(explicitNull.sourceSha256).not.toBe(plan.sourceSha256);
});

it('requires review for unmapped fields, malformed source/token shapes and target bounds', () => {
  const source = BSON.deserialize(importSourceFixture());
  for (const changes of [
    { unknownLegacy: 'private-value' },
    { preferences: { rulerColor: '#123456', unknownLegacy: true } },
    { email: null },
    { audioStoragePrefix: null },
    { provider: null },
    { providerId: null },
    { _id: source._id.toHexString() },
    { createdAt: '2020-01-01' },
    { role: 'admin' },
    { updatedAt: 'not-a-date' },
    { oauthTokens: { accessToken: { ciphertext: 'private-value', iv: 'bad', authTag: 'bad' } } },
    { oauthTokens: { accessToken: { ...source.oauthTokens.accessToken, privateExtra: true } } },
    { firstName: 'x'.repeat(1025) },
    {
      firstName: '🐉'.repeat(512),
      lastName: '🐉'.repeat(512),
      avatarUrl: '🐉'.repeat(2048),
      oauthTokens: {
        accessToken: { ...source.oauthTokens.accessToken, ciphertext: 'YQ=='.repeat(1024) },
      },
    },
  ]) {
    try {
      mapIdentitySource(BSON.serialize({ ...source, ...changes }));
      throw new Error('Expected mapping refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(IdentityMappingError);
      expect(String(error)).not.toContain('private-value');
    }
  }
  const legacy = mapIdentitySource(
    BSON.serialize({ ...source, updatedAt: new Date('2021-01-02T03:04:05.000Z') })
  );
  expect(legacy.snapshot.content).not.toHaveProperty('updatedAt');
  const unboundWithTokens = { ...source, providerId: undefined, provider: undefined };
  expect(() => mapIdentitySource(BSON.serialize(unboundWithTokens))).toThrow(IdentityMappingError);
});

it('refuses duplicate BSON field names and truncated/concatenated frames', () => {
  const raw = Buffer.from(importSourceFixture());
  const extra = Buffer.from(BSON.serialize({ role: 'player' }));
  const duplicate = Buffer.concat([raw.subarray(0, -1), extra.subarray(4)]);
  duplicate.writeInt32LE(duplicate.length, 0);
  for (const input of [duplicate, raw.subarray(0, -1), Buffer.concat([raw, raw])])
    expect(() => mapIdentitySource(input)).toThrow(IdentityMappingError);
});

it('validates the complete import plan before any target read or write', async () => {
  const touched = vi.fn(async () => {
    throw new Error('Target must not be called');
  });
  const importer = createIdentityImporter(
    { get: touched, create: touched, replace: touched },
    { get: touched, put: touched }
  );
  const plan = mapIdentitySource(importSourceFixture());
  for (const input of [
    { ...plan, sourceSha256: 'bad' },
    { ...plan, profileOperationId: plan.account.operationId },
    { ...plan, snapshot: { ...plan.snapshot, userId: '0'.repeat(24) } },
    { ...plan, account: { ...plan.account, binding: null } },
    {
      ...plan,
      snapshot: {
        ...plan.snapshot,
        content: { ...plan.snapshot.content, firstName: 'x'.repeat(1025) },
      },
    },
  ])
    await expect(importer.apply(input as never)).rejects.toThrow();
  expect(touched).not.toHaveBeenCalled();
});
