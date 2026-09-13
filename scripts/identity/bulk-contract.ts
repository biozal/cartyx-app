import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { IdentityAudit } from './audit';
import { importSourceFixture } from './import-contract';
import {
  loadIdentityImportPackage,
  prepareIdentityImportPackage,
  type IdentityImportTarget,
} from './bulk-package';
import {
  createIdentityBulkImporter,
  IdentityBulkImportError,
  identityBulkImportKey,
} from './bulk-import';
import type { ReservationStateStore } from '../../app/server/repositories/identity/reservations';
import type { ImmutableProfileStore } from '../../app/server/repositories/identity/profile-model';
import { createIdentityAccountState } from '../../app/server/repositories/identity/account-state';

export const bulkTargetFixture = (): IdentityImportTarget => ({
  environment: 'local',
  cql: {
    contactPoint: 'fixture.invalid',
    port: 9042,
    servername: 'fixture.invalid',
    datacenter: 'dc1',
    keyspace: 'cartyx_state',
    caSha256: 'a'.repeat(64),
  },
  graph: { url: 'wss://fixture.invalid:8182/gremlin', caSha256: 'b'.repeat(64) },
});
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
const metadata = (file: string, raw: Buffer) => ({
  file,
  bytes: raw.length,
  sha256: createHash('sha256').update(raw).digest('hex'),
});

/** Synthetic BSON only. Used by the unit, real-store and actual-restart contracts. */
export async function writeBulkArchiveFixture(
  directory: string,
  users?: Uint8Array[],
  campaigns?: Uint8Array[]
) {
  await mkdir(directory, { mode: 0o700 });
  const { BSON } = mongoose.mongo;
  if (!users) {
    const first = BSON.deserialize(importSourceFixture());
    const second = BSON.deserialize(importSourceFixture(false));
    const campaignId = new BSON.ObjectId();
    first.campaigns = [{ campaignId }];
    second.campaigns = [{ campaignId }];
    users = [BSON.serialize(first), BSON.serialize(second)];
    campaigns = [
      BSON.serialize({
        _id: campaignId,
        gameMasterId: first._id,
        members: [
          { userId: first._id, role: 'gm' },
          { userId: second._id, role: 'player' },
        ],
        archiveOnly: { value: BSON.Long.fromString('9223372036854775807') },
      }),
    ];
  }
  campaigns ??= [];
  const audit = new IdentityAudit();
  for (const raw of users) audit.add('users', raw);
  for (const raw of campaigns) audit.add('campaigns', raw);
  const report = audit.finish();
  const rawUsers = Buffer.concat(users);
  const rawCampaigns = Buffer.concat(campaigns);
  const rawAudit = encode(report);
  const catalog = encode({ users: {}, campaigns: {} });
  const manifest = {
    version: 1,
    kind: 'cartyx-identity-preflight',
    complete: true,
    source: 'local',
    snapshot: { $timestamp: { t: 1, i: 1 } },
    catalogConsistency: 'live-before-and-after-not-snapshot',
    collections: [
      { ...metadata('users.bson', rawUsers), count: users.length },
      { ...metadata('campaigns.bson', rawCampaigns), count: campaigns.length },
    ],
    catalog: metadata('catalog.json', catalog),
    audit: metadata('audit.json', rawAudit),
  };
  for (const [name, bytes] of Object.entries({
    'users.bson': rawUsers,
    'campaigns.bson': rawCampaigns,
    'catalog.json': catalog,
    'audit.json': rawAudit,
    'manifest.json': encode(manifest),
  }))
    await writeFile(join(directory, name), bytes, { mode: 0o600, flag: 'wx' });
}

export async function identityBulkImportContract(
  state: ReservationStateStore,
  graph: ImmutableProfileStore
) {
  const root = await mkdtemp(join(tmpdir(), 'cartyx-bulk-contract-'));
  const target = bulkTargetFixture();
  const runner = createIdentityBulkImporter(state, graph, target);
  const fixture = async () => {
    const id = randomUUID();
    const source = join(root, `${id}-source`);
    const directory = join(root, `${id}-package`);
    await writeBulkArchiveFixture(source);
    await prepareIdentityImportPackage(source, directory, target);
    const batch = await loadIdentityImportPackage(directory, target);
    return { source, directory, batch };
  };
  try {
    const initial = await fixture();
    await assert.rejects(runner.verify(initial.directory), IdentityBulkImportError);
    await runner.apply(initial.directory);
    await runner.verify(initial.directory);
    // Original archive can be moved away: the package retains all original bytes.
    await rm(initial.source, { recursive: true });
    assert.deepEqual(await loadIdentityImportPackage(initial.directory, target), initial.batch);
    await runner.apply(initial.directory);
    // Newer target state causes refusal; historical batches never restore old tokens.
    const accounts = createIdentityAccountState(state);
    const first = initial.batch.plans[0].account;
    const logout = {
      kind: 'logout' as const,
      userId: first.userId,
      operationId: randomUUID(),
      expectedRevision: first.operationId,
      providerId: first.binding!.providerId,
      expectedTokenRevision: first.operationId,
    };
    await accounts.begin(logout);
    assert.equal(await accounts.resume(logout.operationId), 'applied');
    await assert.rejects(runner.apply(initial.directory), IdentityBulkImportError);
    assert.equal(await accounts.readTokens(first.userId), null);

    // Competing identical packages converge using the original retained plans.
    // Real JanusGraph contention can be uncertain; wait for all workers before resuming.
    const concurrent = await fixture();
    await Promise.allSettled(Array.from({ length: 4 }, () => runner.apply(concurrent.directory)));
    await runner.apply(concurrent.directory);
    await runner.verify(concurrent.directory);

    // Failure before/after the batch anchor, between users, and at final receipt.
    // Existing per-user contracts cover all lower-level write boundaries.
    for (const boundary of ['anchor', 'between_users', 'receipt'] as const)
      for (const afterCommit of [false, true]) {
        const item = await fixture();
        const firstId = item.batch.plans[0].account.userId;
        const secondId = item.batch.plans[1].account.userId;
        let fired = false;
        const fault = async <T>(hit: boolean, work: () => Promise<T>) => {
          const fail = hit && !fired;
          if (fail) fired = true;
          if (fail && !afterCommit) throw new Error('private bulk driver details');
          const result = await work();
          if (fail && afterCommit) throw new Error('private bulk driver details');
          return result;
        };
        const interrupted = createIdentityBulkImporter(
          {
            get: (key) => state.get(key),
            create: (...args) =>
              fault(boundary === 'anchor' && args[0].type === 'identity_bulk_import', () =>
                state.create(...args)
              ),
            replace: (...args) =>
              fault(
                (boundary === 'receipt' && args[0].type === 'identity_bulk_import') ||
                  (boundary === 'between_users' &&
                    args[0].type === 'identity_import' &&
                    args[0].scope === `user:${firstId}`),
                () => state.replace(...args)
              ),
          },
          graph,
          target
        );
        await assert.rejects(interrupted.apply(item.directory), (error: unknown) => {
          assert.ok(error instanceof IdentityBulkImportError);
          assert.equal(error.batchId, item.batch.manifest.batchId);
          assert.ok(!JSON.stringify(error).includes('private bulk driver'));
          return true;
        });
        assert.ok(fired);
        if (boundary === 'anchor' || boundary === 'between_users')
          assert.equal(await accounts.readAccount(secondId), null);
        assert.deepEqual(await loadIdentityImportPackage(item.directory, target), item.batch);
        await runner.apply(item.directory);
        await runner.verify(item.directory);
        assert.equal(
          (await accounts.readAccount(firstId))!.revision,
          item.batch.plans[0].account.operationId
        );
      }

    // A valid changed package cannot take over the already-anchored batch ID.
    const original = await fixture();
    await runner.apply(original.directory);
    const other = await fixture();
    const manifestPath = join(other.directory, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.batchId = original.batch.manifest.batchId;
    await writeFile(manifestPath, encode(manifest));
    await assert.rejects(runner.apply(other.directory), IdentityBulkImportError);
    assert.equal(await accounts.readAccount(other.batch.plans[0].account.userId), null);
    assert.ok(await state.get(identityBulkImportKey(original.batch.manifest.batchId)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
