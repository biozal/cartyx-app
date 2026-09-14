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
import {
  createIdentityAccountState,
  identityAccountKey,
} from '../../app/server/repositories/identity/account-state';

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
  let inspectionWrites = 0;
  const refuseWrite = async () => {
    inspectionWrites++;
    throw new Error('Inspection attempted a mutation');
  };
  const observe = async (
    directory: string,
    get: ReservationStateStore['get'] = (key) => state.get(key),
    graphGet: ImmutableProfileStore['get'] = (...args) => graph.get(...args)
  ) => {
    const report = await createIdentityBulkImporter(
      { get, create: refuseWrite, replace: refuseWrite },
      { get: graphGet, put: refuseWrite },
      target
    ).inspect(directory);
    assert.equal(inspectionWrites, 0);
    return report;
  };
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
    const empty = await observe(initial.directory);
    assert.equal(empty.batchReceipt, 'missing');
    assert.equal(empty.matchingUsers, 0);
    assert.equal(empty.allObservedMatching, false);
    assert.deepEqual(
      empty.observations.map((item) => item.receipt),
      ['missing', 'missing']
    );
    assert.deepEqual(
      empty.observations.map((item) => item.account),
      ['different', 'different']
    );
    await assert.rejects(runner.verify(initial.directory), IdentityBulkImportError);
    await runner.apply(initial.directory);
    await runner.verify(initial.directory);
    const complete = await observe(initial.directory);
    assert.deepEqual(complete, {
      version: 1,
      users: 2,
      archivedCampaigns: 1,
      batchReceipt: 'applied',
      observations: [1, 2].map((ordinal) => ({
        ordinal,
        receipt: 'applied',
        reservations: 'matching',
        account: 'matching',
        profile: 'matching',
      })),
      matchingUsers: 2,
      allObservedMatching: true,
      cutoverReady: false,
    });
    // Read overlays simulate corruption/outages without altering the retained fixture.
    // Each field stays conservative and other users are still inspected.
    for (const type of ['identity_bulk_import', 'identity_import'])
      for (const failure of ['missing', 'changed', 'malformed', 'unreadable']) {
        const report = await observe(initial.directory, async (key) => {
          const row = await state.get(key);
          if (key.type !== type) return row;
          if (failure === 'missing') return null;
          if (failure === 'unreadable') throw new Error('private driver identity and credentials');
          return {
            ...row!,
            value:
              failure === 'malformed'
                ? { private: 'malformed receipt' }
                : { ...(row!.value as object), digest: '0'.repeat(64) },
          };
        });
        const expected =
          failure === 'missing' ? 'missing' : failure === 'changed' ? 'conflict' : 'unverified';
        assert.equal(
          type === 'identity_bulk_import' ? report.batchReceipt : report.observations[0].receipt,
          expected
        );
        assert.equal(report.allObservedMatching, false);
        assert.ok(!JSON.stringify(report).includes('private'));
      }
    for (const [type, field] of [
      ['identity_account', 'account'],
      ['identity_profile_head', 'profile'],
      ['identity_reservation', 'reservations'],
    ] as const)
      for (const failure of ['missing', 'malformed', 'unreadable']) {
        const report = await observe(initial.directory, async (key) => {
          if (key.type !== type) return state.get(key);
          if (failure === 'missing') return null;
          if (failure === 'unreadable') throw new Error('private target state');
          return { revision: randomUUID(), value: { private: 'invalid state' } };
        });
        assert.equal(
          report.observations[0][field],
          failure === 'missing' ? 'different' : 'unverified'
        );
        assert.equal(report.allObservedMatching, false);
        assert.equal(report.observations[1].receipt, 'applied');
      }
    for (const failure of ['missing', 'changed', 'unreadable']) {
      const report = await observe(initial.directory, undefined, async (...args) => {
        if (failure === 'missing') return null;
        if (failure === 'unreadable') throw new Error('private Gremlin details');
        const snapshot = await graph.get(...args);
        return { ...snapshot!, content: { ...snapshot!.content, firstName: 'Changed' } };
      });
      assert.equal(report.observations[0].profile, 'unverified');
      assert.equal(report.matchingUsers, 0);
      assert.equal(report.allObservedMatching, false);
    }
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
    const newer = await observe(initial.directory);
    assert.equal(newer.batchReceipt, 'applied');
    assert.equal(newer.observations[0].receipt, 'applied');
    assert.equal(newer.observations[0].account, 'different');
    assert.equal(newer.matchingUsers, 1);
    assert.equal(newer.allObservedMatching, false);

    // Competing identical packages converge using the original retained plans.
    // Real JanusGraph contention can be uncertain; wait for all workers before resuming.
    const concurrent = await fixture();
    await Promise.allSettled(Array.from({ length: 4 }, () => runner.apply(concurrent.directory)));
    await runner.apply(concurrent.directory);
    await runner.verify(concurrent.directory);
    // Same encrypted values in a later generation must not conceal a read race.
    const originalAccount = concurrent.batch.plans[0].account;
    let accountReads = 0;
    const race = await observe(concurrent.directory, async (key) => {
      if (
        JSON.stringify(key) === JSON.stringify(identityAccountKey(originalAccount.userId)) &&
        ++accountReads === 2
      ) {
        const command = {
          kind: 'login' as const,
          userId: originalAccount.userId,
          operationId: randomUUID(),
          expectedRevision: originalAccount.operationId,
          binding: originalAccount.binding!,
          tokens: originalAccount.tokens!,
        };
        await accounts.begin(command);
        assert.equal(await accounts.resume(command.operationId), 'applied');
      }
      return state.get(key);
    });
    assert.equal(race.observations[0].account, 'different');
    assert.equal(race.allObservedMatching, false);
    await assert.rejects(runner.verify(concurrent.directory), IdentityBulkImportError);

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
        const interruptedReport = await observe(item.directory);
        assert.equal(
          interruptedReport.batchReceipt,
          boundary === 'anchor' && !afterCommit
            ? 'missing'
            : boundary === 'receipt' && afterCommit
              ? 'applied'
              : 'prepared'
        );
        assert.equal(
          interruptedReport.matchingUsers,
          boundary === 'receipt' ? 2 : boundary === 'between_users' && afterCommit ? 1 : 0
        );
        assert.equal(interruptedReport.allObservedMatching, boundary === 'receipt' && afterCommit);
        if (boundary === 'anchor' || boundary === 'between_users')
          assert.equal(await accounts.readAccount(secondId), null);
        assert.deepEqual(await loadIdentityImportPackage(item.directory, target), item.batch);
        await runner.apply(item.directory);
        await runner.verify(item.directory);
        assert.equal((await observe(item.directory)).allObservedMatching, true);
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
    const conflict = await observe(other.directory);
    assert.equal(conflict.batchReceipt, 'conflict');
    assert.equal(conflict.matchingUsers, 0);
    assert.equal(conflict.allObservedMatching, false);
    assert.equal(await accounts.readAccount(other.batch.plans[0].account.userId), null);
    assert.ok(await state.get(identityBulkImportKey(original.batch.manifest.batchId)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
