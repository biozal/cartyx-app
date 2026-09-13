// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.unmock('mongoose');
import mongoose from 'mongoose';
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { IdentityAudit } from '../../../scripts/identity/audit';
import { verifyArchive } from '../../../scripts/identity/archive';

const { BSON } = mongoose.mongo;
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
const metadata = (file: string, raw: Uint8Array) => ({
  file,
  bytes: raw.length,
  sha256: createHash('sha256').update(raw).digest('hex'),
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'cartyx-identity-unit-'));
  directories.push(directory);
  const userId = new BSON.ObjectId();
  const campaignId = new BSON.ObjectId();
  const user = BSON.serialize({
    _id: userId,
    role: 'gm',
    campaigns: [{ campaignId }],
    oauthTokens: {
      accessToken: { ciphertext: 'private-cipher', iv: 'private-iv', authTag: 'private-tag' },
      refreshToken: null,
    },
    audioStoragePrefix: 'a'.repeat(32),
    legacy: {
      integer: new BSON.Int32(7),
      long: BSON.Long.fromString('9223372036854775807'),
      null: null,
    },
  });
  const campaign = BSON.serialize({
    _id: campaignId,
    gameMasterId: userId,
    members: [{ userId, role: 'gm' }],
  });
  const audit = new IdentityAudit();
  audit.add('users', user);
  audit.add('campaigns', campaign);
  const report = audit.finish();
  const catalog = encode({ users: {}, campaigns: {} });
  const auditRaw = encode(report);
  const manifest = {
    version: 1,
    kind: 'cartyx-identity-preflight',
    complete: true,
    source: 'local',
    snapshot: { $timestamp: { t: 1, i: 1 } },
    catalogConsistency: 'live-before-and-after-not-snapshot',
    collections: [
      { ...metadata('users.bson', user), count: 1 },
      { ...metadata('campaigns.bson', campaign), count: 1 },
    ],
    catalog: metadata('catalog.json', catalog),
    audit: metadata('audit.json', auditRaw),
  };
  for (const [name, raw] of Object.entries({
    'users.bson': user,
    'campaigns.bson': campaign,
    'audit.json': auditRaw,
    'catalog.json': catalog,
    'manifest.json': encode(manifest),
  })) {
    await writeFile(join(directory, name), raw, { mode: 0o600 });
  }
  return { directory, manifest, report, user };
}

describe('identity source audit', () => {
  it('preserves hidden/legacy field inventory without reporting field values', async () => {
    const { directory, report } = await fixture();
    expect(await verifyArchive(directory)).toEqual(report);
    expect(report.findings).toEqual({});
    expect(report.fields).toContainEqual({
      path: ['users', 'legacy', 'long'],
      type: 'Long',
      occurrences: 1,
    });
    expect(report.fields).toContainEqual({
      path: ['users', 'legacy', 'integer'],
      type: 'Int32',
      occurrences: 1,
    });
    expect(JSON.stringify(report)).not.toContain('private-cipher');
    expect(JSON.stringify(report)).not.toContain('a'.repeat(32));
  });

  it('flags sparse explicit null duplicates, global provider IDs, and orphan/mirrored membership without changing input', () => {
    const audit = new IdentityAudit();
    const userId = new BSON.ObjectId();
    const missing = new BSON.ObjectId();
    const campaignId = new BSON.ObjectId();
    const raw = BSON.serialize({
      _id: userId,
      role: 'gm',
      email: null,
      provider: 'one',
      providerId: 'same',
      campaigns: [{ campaignId: missing }],
      oauthTokens: { accessToken: { ciphertext: 'x' } },
    });
    const original = Buffer.from(raw);
    audit.add('users', raw);
    audit.add(
      'users',
      BSON.serialize({
        _id: new BSON.ObjectId(),
        role: 'player',
        email: null,
        provider: 'two',
        providerId: 'same',
      })
    );
    audit.add('users', BSON.serialize({ _id: new BSON.ObjectId(), role: 'unknown' }));
    audit.add(
      'campaigns',
      BSON.serialize({
        _id: campaignId,
        gameMasterId: missing,
        members: [
          { userId, role: 'player' },
          { userId: missing, role: 'player' },
        ],
      })
    );
    expect(audit.finish().findings).toMatchObject({
      'users.email.duplicate_exact_value': 1,
      'users.email.null_or_empty': 2,
      'users.providerId.duplicate_exact_value': 1,
      'users.invalid_oauth_envelope': 1,
      'users.orphan_campaign_reference': 1,
      'campaigns.orphan_member': 1,
      'campaigns.orphan_game_master': 1,
      'membership.campaign_member_without_user_link': 1,
    });
    expect(audit.finish()).toEqual(audit.finish());
    expect(raw).toEqual(original);
  });
});

describe('private identity archive verification', () => {
  it.each([
    'missing-manifest',
    'incomplete',
    'hash',
    'count',
    'path',
    'audit',
    'truncated',
    'oversized',
    'trailing',
    'mode',
    'symlink',
  ])('refuses %s artifacts', async (failure) => {
    const { directory, manifest, user } = await fixture();
    const path = join(directory, 'users.bson');
    if (failure === 'missing-manifest') await rm(join(directory, 'manifest.json'));
    if (failure === 'incomplete') {
      manifest.complete = false;
      await writeFile(join(directory, 'manifest.json'), encode(manifest));
    }
    if (failure === 'hash') {
      manifest.collections[0].sha256 = '0'.repeat(64);
      await writeFile(join(directory, 'manifest.json'), encode(manifest));
    }
    if (failure === 'count') {
      manifest.collections[0].count++;
      await writeFile(join(directory, 'manifest.json'), encode(manifest));
    }
    if (failure === 'path') {
      manifest.collections[0].file = '../users.bson';
      await writeFile(join(directory, 'manifest.json'), encode(manifest));
    }
    if (failure === 'audit') {
      const altered = encode({ counts: { users: 0 } });
      await writeFile(join(directory, 'audit.json'), altered);
      manifest.audit = metadata('audit.json', altered);
      await writeFile(join(directory, 'manifest.json'), encode(manifest));
    }
    if (failure === 'truncated') await writeFile(path, user.subarray(0, user.length - 1));
    if (failure === 'oversized') {
      const raw = Buffer.from(user);
      raw.writeInt32LE(0x7fffffff);
      await writeFile(path, raw);
    }
    if (failure === 'trailing') await writeFile(path, Buffer.concat([user, Buffer.from([1])]));
    if (failure === 'mode') await chmod(path, 0o644);
    if (failure === 'symlink') {
      await rm(path);
      await symlink(join(directory, 'campaigns.bson'), path);
    }
    await expect(verifyArchive(directory)).rejects.toThrow();
    // Verification never repairs or rewrites evidence.
    if (failure !== 'missing-manifest')
      expect(await readFile(join(directory, 'manifest.json'))).toBeTruthy();
  });
});
