import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { createIdentityAccountState } from '../../app/server/repositories/identity/account-state';
import { createIdentityProfiles } from '../../app/server/repositories/identity/profile-head';
import {
  createIdentityReservations,
  type ReservationStateStore,
} from '../../app/server/repositories/identity/reservations';
import { createTargetIdentityReader } from '../../app/server/repositories/identity/target-reader';
import type { ImmutableProfileStore } from '../../app/server/repositories/identity/profile-model';
import { createIdentityImporter, identityImportKey } from './import-account';
import { mapIdentitySource } from './import-source';
const { BSON } = mongoose.mongo;
export function importSourceFixture(bound = true) {
  const userId = new BSON.ObjectId();
  const envelope = {
    ciphertext: randomBytes(32).toString('base64'),
    iv: randomBytes(12).toString('base64'),
    authTag: randomBytes(16).toString('base64'),
  };
  return BSON.serialize({
    _id: userId,
    ...(bound && {
      provider: 'fixture',
      providerId: `fixture_import_${userId.toHexString()}`,
      email: `Exact+${userId.toHexString()}@Example.invalid`,
      audioStoragePrefix: randomBytes(16).toString('hex'),
      oauthTokens: { accessToken: envelope, refreshToken: { ...envelope } },
    }),
    firstName: "Mira'); -- 🐉",
    lastName: null,
    role: 'gm',
    preferences: { rulerColor: '#aBc123' },
    createdAt: new Date('2020-01-02T03:04:05.006Z'),
    lastLoginAt: new Date('2026-09-13T12:00:00.007Z'),
    campaigns: [],
    __v: new BSON.Int32(4),
  });
}
export async function identityImportContract(
  state: ReservationStateStore,
  graph: ImmutableProfileStore
) {
  const importer = createIdentityImporter(state, graph);
  const plan = mapIdentitySource(importSourceFixture());
  const reader = createTargetIdentityReader(state, graph);
  const accounts = createIdentityAccountState(state);
  const profiles = createIdentityProfiles(state, graph);
  let physicalWrites = 0;
  await createIdentityImporter(
    {
      get: (key) => state.get(key),
      create: (...args) => {
        physicalWrites++;
        return state.create(...args);
      },
      replace: (...args) => {
        physicalWrites++;
        return state.replace(...args);
      },
    },
    {
      get: (...args) => graph.get(...args),
      put: (snapshot) => {
        physicalWrites++;
        return graph.put(snapshot);
      },
    }
  ).apply(plan);
  await importer.verify(plan);
  await importer.apply(plan);
  const userId = plan.account.userId;
  assert.deepEqual(await reader.findProfile(plan.account.binding!.providerId), {
    id: userId,
    email: plan.account.email,
    firstName: plan.snapshot.content.firstName,
    lastName: null,
    avatarUrl: null,
    role: 'gm',
  });
  assert.equal(await reader.lookupAudioStoragePrefix(userId), plan.account.audioStoragePrefix);
  assert.deepEqual((await accounts.readTokens(userId))?.tokens, plan.account.tokens);
  const receipt = await state.get(identityImportKey(userId));
  assert.equal(
    JSON.stringify(receipt).includes(plan.account.tokens!.accessToken!.ciphertext),
    false
  );
  await assert.rejects(
    importer.apply({ ...plan, sourceSha256: '0'.repeat(64) }),
    /source or plan changed/
  );
  await assert.rejects(
    importer.apply({ ...plan, profileOperationId: randomUUID() }),
    /source or plan changed/
  );

  // Fault every composite write boundary, before commit and after lost acknowledgement.
  // graph.put's three internal writes are separately exercised by graph-integration.ts.
  for (const afterCommit of [false, true])
    for (let faultAt = 1; faultAt <= physicalWrites; faultAt++) {
      const input = mapIdentitySource(importSourceFixture());
      let writes = 0;
      const fault = async <T>(write: () => Promise<T>) => {
        const fail = ++writes === faultAt;
        if (fail && !afterCommit) throw new Error('import interruption');
        const result = await write();
        if (fail && afterCommit) throw new Error('import interruption');
        return result;
      };
      const interrupted = createIdentityImporter(
        {
          get: (key) => state.get(key),
          create: (...args) => fault(() => state.create(...args)),
          replace: (...args) => fault(() => state.replace(...args)),
        },
        {
          get: (...args) => graph.get(...args),
          put: (snapshot) => fault(() => graph.put(snapshot)),
        }
      );
      await assert.rejects(interrupted.apply(input), /import interruption/);
      const fresh = createIdentityImporter(state, graph);
      await fresh.apply(input);
      await fresh.verify(input);
    }

  const unbound = mapIdentitySource(importSourceFixture(false));
  await importer.apply(unbound);
  await importer.verify(unbound);
  assert.equal((await accounts.readAccount(unbound.account.userId))?.binding, null);
  assert.equal(await accounts.readTokens(unbound.account.userId), null);
  assert.equal(await reader.lookupAudioStoragePrefix(unbound.account.userId), null);

  const occupied = mapIdentitySource(importSourceFixture(false));
  const existing = randomUUID();
  await accounts.begin({
    kind: 'initialize',
    operationId: existing,
    userId: occupied.account.userId,
    email: null,
    audioStoragePrefix: null,
  });
  await accounts.resume(existing);
  await assert.rejects(importer.apply(occupied), /empty target account/);
  assert.equal(await state.get(identityImportKey(occupied.account.userId)), null);
  assert.equal((await accounts.readAccount(occupied.account.userId))?.revision, existing);

  const conflict = mapIdentitySource(importSourceFixture());
  const reservations = createIdentityReservations(state);
  const reserved = randomUUID();
  await reservations.begin({
    operationId: reserved,
    userId: randomBytes(12).toString('hex'),
    claims: [{ kind: 'email', value: conflict.account.email! }],
  });
  await reservations.resume(reserved);
  await assert.rejects(importer.apply(conflict), /identifier conflict/);
  await assert.rejects(importer.apply(conflict), /identifier conflict/);
  assert.equal(await accounts.readAccount(conflict.account.userId), null);
  assert.equal(await profiles.read(conflict.account.userId), null);

  // Two resumptions can meet at the graph edge lock; an explicit resume resolves
  // that uncertainty using the original plan, without generating new operation IDs.
  const concurrent = mapIdentitySource(importSourceFixture());
  const attempts = await Promise.allSettled([
    importer.apply(concurrent),
    importer.apply(concurrent),
  ]);
  for (const result of attempts)
    if (result.status === 'rejected') assert.match(String(result.reason), /Graph request failed/);
  await importer.apply(concurrent);
  await importer.verify(concurrent);

  // A login after the account receipt but before the import receipt is not rolled
  // back by recovering the pending import. Keep it pending for operator review.
  const pending = mapIdentitySource(importSourceFixture());
  const interrupted = createIdentityImporter(
    {
      get: (key) => state.get(key),
      create: (...args) => state.create(...args),
      replace: async (...args) => {
        const result = await state.replace(...args);
        if (args[0].type === 'identity_account_operation')
          throw new Error('pending import receipt');
        return result;
      },
    },
    graph
  );
  await assert.rejects(interrupted.apply(pending), /pending import receipt/);
  const newerLogin = randomUUID();
  await accounts.begin({
    kind: 'login',
    operationId: newerLogin,
    userId: pending.account.userId,
    expectedRevision: pending.account.operationId,
    binding: pending.account.binding!,
    tokens: { accessToken: null, refreshToken: null },
  });
  await accounts.resume(newerLogin);
  await assert.rejects(importer.apply(pending), /target differs/);
  assert.equal((await accounts.readAccount(pending.account.userId))?.revision, newerLogin);
  const pendingReceipt = (await state.get(identityImportKey(pending.account.userId)))?.value as {
    status: string;
  };
  assert.equal(pendingReceipt.status, 'prepared');

  // An import receipt is historical: a later login/profile update must never be undone on replay.
  const loginId = randomUUID();
  await accounts.begin({
    kind: 'login',
    operationId: loginId,
    userId,
    expectedRevision: plan.account.operationId,
    binding: plan.account.binding!,
    tokens: { accessToken: null, refreshToken: null },
  });
  await accounts.resume(loginId);
  const profileId = randomUUID();
  await profiles.begin({
    operationId: profileId,
    expectedRevision: plan.profileOperationId,
    snapshot: {
      ...plan.snapshot,
      snapshotId: randomBytes(12).toString('hex'),
      content: { ...plan.snapshot.content, firstName: 'New profile' },
    },
  });
  await profiles.resume(profileId);
  await assert.rejects(importer.apply(plan), /target differs/);
  await assert.rejects(importer.verify(plan), /target differs/);
  assert.equal((await accounts.readAccount(userId))?.revision, loginId);
  assert.equal((await profiles.read(userId))?.revision, profileId);
}
