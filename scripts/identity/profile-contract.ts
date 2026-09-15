import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  createIdentityProfiles,
  type PublishProfile,
} from '../../app/server/repositories/identity/profile-head';
import {
  createIdentityReservations,
  type ReservationStateStore,
} from '../../app/server/repositories/identity/reservations';
import { createIdentityAccountState } from '../../app/server/repositories/identity/account-state';
import { createTargetIdentityReader } from '../../app/server/repositories/identity/target-reader';
import type {
  ImmutableProfileStore,
  ProfileSnapshot,
} from '../../app/server/repositories/identity/profile-model';
export const profileFixture = (userId = randomBytes(12).toString('hex')): ProfileSnapshot => ({
  userId,
  snapshotId: randomBytes(12).toString('hex'),
  content: {
    firstName: "Mira'); DROP GRAPH; -- 🐉",
    lastName: 'Keeper',
    avatarUrl: null,
    role: 'player',
    rulerColor: '#aBc123',
    createdAt: '2020-01-02T03:04:05.000Z',
    lastLoginAt: '2026-09-13T12:00:00.000Z',
  },
});
export async function identityProfileContract(
  state: ReservationStateStore,
  graph: ImmutableProfileStore
) {
  const profiles = createIdentityProfiles(state, graph);
  const command = (
    snapshot = profileFixture(),
    expectedRevision: string | null = null
  ): PublishProfile => ({ operationId: randomUUID(), expectedRevision, snapshot });
  const publish = async (input: PublishProfile) => {
    await profiles.begin(input);
    return profiles.resume(input.operationId);
  };
  const initial = command();
  assert.equal(await profiles.read(initial.snapshot.userId), null);
  assert.equal(await publish(initial), 'applied');
  assert.deepEqual((await profiles.read(initial.snapshot.userId))?.snapshot, initial.snapshot);
  assert.equal(await publish(initial), 'applied');
  await assert.rejects(
    profiles.begin({ ...initial, snapshot: profileFixture(initial.snapshot.userId) }),
    /ID reused/
  );
  await assert.rejects(
    graph.put({ ...initial.snapshot, content: { ...initial.snapshot.content, role: 'gm' } }),
    /revision ID reused/i
  );
  assert.deepEqual(
    await graph.get(initial.snapshot.userId, initial.snapshot.snapshotId),
    initial.snapshot
  );
  assert.equal(await graph.get(randomBytes(12).toString('hex'), initial.snapshot.snapshotId), null);

  const contenders = Array.from({ length: 8 }, () =>
    command(profileFixture(initial.snapshot.userId), initial.operationId)
  );
  await Promise.all(contenders.map((input) => profiles.begin(input)));
  const attempts = await Promise.allSettled(
    contenders.map((input) => profiles.resume(input.operationId))
  );
  for (const attempt of attempts)
    if (attempt.status === 'rejected') assert.match(String(attempt.reason), /Graph request failed/);
  // A JanusGraph lock conflict is uncertain; an explicit subsequent resume resolves it.
  const results = [];
  for (const input of contenders) results.push(await profiles.resume(input.operationId));
  assert.equal(results.filter((result) => result === 'applied').length, 1);
  const winner = contenders[results.indexOf('applied')];
  assert.equal((await profiles.read(initial.snapshot.userId))?.revision, winner.operationId);
  assert.equal(await profiles.resume(initial.operationId), 'applied');
  assert.equal((await profiles.read(initial.snapshot.userId))?.revision, winner.operationId);

  // Stop before/after intent, graph, pointer and receipt writes; use a fresh publisher.
  for (const afterCommit of [false, true])
    for (let faultAt = 1; faultAt <= 4; faultAt++) {
      const input = command();
      let writes = 0;
      const fault = async <T>(write: () => Promise<T>) => {
        const fail = ++writes === faultAt;
        if (fail && !afterCommit) throw new Error('profile interruption');
        const result = await write();
        if (fail && afterCommit) throw new Error('profile interruption');
        return result;
      };
      const interrupted = createIdentityProfiles(
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
      await assert.rejects(async () => {
        await interrupted.begin(input);
        await interrupted.resume(input.operationId);
      }, /profile interruption/);
      const fresh = createIdentityProfiles(state, graph);
      await fresh.begin(input);
      assert.equal(await fresh.resume(input.operationId), 'applied');
      assert.deepEqual((await fresh.read(input.snapshot.userId))?.snapshot, input.snapshot);
    }

  // A delayed graph writer may create an orphan version, but cannot select it after losing CAS.
  const old = command(profileFixture(initial.snapshot.userId), winner.operationId);
  await profiles.begin(old);
  let ready!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const delayed = createIdentityProfiles(state, {
    get: (...args) => graph.get(...args),
    put: async (snapshot) => {
      ready();
      await barrier;
      await graph.put(snapshot);
    },
  });
  const delayedResult = delayed.resume(old.operationId);
  await Promise.race([
    reached,
    delayedResult.then(() => {
      throw new Error('Profile fixture missed barrier');
    }),
  ]);
  const newer = command(profileFixture(initial.snapshot.userId), winner.operationId);
  try {
    assert.equal(await publish(newer), 'applied');
  } finally {
    release();
  }
  assert.equal(await delayedResult, 'rejected');
  assert.equal((await profiles.read(initial.snapshot.userId))?.revision, newer.operationId);

  const pending = command();
  await profiles.begin(pending);
  const lostPointer = createIdentityProfiles(
    {
      get: (key) => state.get(key),
      replace: (...args) => state.replace(...args),
      create: async (...args) => {
        await state.create(...args);
        throw new Error('lost profile pointer');
      },
    },
    graph
  );
  await assert.rejects(lostPointer.resume(pending.operationId), /lost profile pointer/);
  await assert.rejects(profiles.read(pending.snapshot.userId), /requires operation recovery/);
  const next = command(profileFixture(pending.snapshot.userId), pending.operationId);
  await profiles.begin(next);
  await assert.rejects(profiles.resume(next.operationId), /requires operation recovery/);
  await profiles.resume(pending.operationId);
  assert.equal(await profiles.resume(next.operationId), 'applied');

  // Target reads combine graph content with the exact settled account binding.
  const reader = createTargetIdentityReader(state, graph);
  const reservations = createIdentityReservations(state);
  const accounts = createIdentityAccountState(state);
  const userId = initial.snapshot.userId;
  const providerId = `fixture_profile_${userId}`;
  const email = `${userId}@example.invalid`;
  const prefix = randomBytes(16).toString('hex');
  const reservationId = randomUUID();
  await reservations.begin({
    operationId: reservationId,
    userId,
    claims: [
      { kind: 'provider_id', value: providerId },
      { kind: 'email', value: email },
      { kind: 'audio_prefix', value: prefix },
    ],
  });
  await reservations.resume(reservationId);
  assert.equal(
    await reader.findProfile(providerId),
    null,
    'A reservation cannot create an authenticated user'
  );
  const initializeId = randomUUID();
  await accounts.begin({
    kind: 'initialize',
    operationId: initializeId,
    userId,
    email,
    audioStoragePrefix: prefix,
  });
  await accounts.resume(initializeId);
  assert.equal(
    await reader.findProfile(providerId),
    null,
    'An unbound account cannot authenticate'
  );
  const loginId = randomUUID();
  await accounts.begin({
    kind: 'login',
    operationId: loginId,
    userId,
    expectedRevision: initializeId,
    binding: { provider: 'fixture', providerId },
    tokens: { accessToken: null, refreshToken: null },
  });
  await accounts.resume(loginId);
  const content = newer.snapshot.content;
  assert.deepEqual(await reader.findProfile(providerId), {
    id: userId,
    email,
    firstName: content.firstName,
    lastName: content.lastName,
    avatarUrl: null,
    role: 'player',
  });
  assert.equal(await reader.findUserId(providerId), userId);
  assert.deepEqual(await reader.readDisplayName(userId), {
    firstName: content.firstName,
    lastName: content.lastName,
    email,
  });
  assert.deepEqual(await reader.readPreferences(providerId), { rulerColor: content.rulerColor });
  assert.equal(await reader.lookupAudioStoragePrefix(userId), prefix);
  assert.equal(await reader.findProfile(`missing_${randomUUID()}`), null);
  const wrongId = `fixture_wrong_${userId}`;
  const wrongReservation = randomUUID();
  await reservations.begin({
    operationId: wrongReservation,
    userId,
    claims: [{ kind: 'provider_id', value: wrongId }],
  });
  await reservations.resume(wrongReservation);
  assert.equal(
    await reader.findProfile(wrongId),
    null,
    'Another reserved identifier is not the bound provider'
  );
  const missingGraph = createTargetIdentityReader(state, {
    put: (...args) => graph.put(...args),
    get: async () => null,
  });
  await assert.rejects(missingGraph.findProfile(providerId), /graph content missing or changed/);
}
