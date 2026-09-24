import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  createIdentityReservations,
  identityReservationKey,
  type IdentityReservationIntent,
  type ReservationStateStore,
} from '../../app/server/repositories/identity/reservations';

const intent = (): IdentityReservationIntent => {
  const userId = randomBytes(12).toString('hex');
  return {
    operationId: randomUUID(),
    userId,
    claims: [
      { kind: 'provider_id', value: `fixture_${userId}` },
      { kind: 'email', value: `${userId}@example.invalid` },
      { kind: 'audio_prefix', value: randomBytes(16).toString('hex') },
    ],
  };
};

/** Runs against real CQL in CI and an in-memory store for fast regression checks. */
export async function identityReservationContract(store: ReservationStateStore) {
  const reservations = createIdentityReservations(store);
  // Independent processes competing for exactly the same identifiers have one owner.
  const first = intent();
  const contenders = Array.from({ length: 8 }, () => ({
    ...first,
    operationId: randomUUID(),
    userId: randomBytes(12).toString('hex'),
  }));
  await Promise.all(contenders.map((input) => reservations.begin(input)));
  const outcomes = await Promise.all(
    contenders.map((input) => createIdentityReservations(store).resume(input.operationId))
  );
  assert.equal(outcomes.filter((status) => status === 'reserved').length, 1);
  assert.equal(outcomes.filter((status) => status === 'conflict').length, 7);
  const winner = contenders[outcomes.indexOf('reserved')];
  for (const claim of first.claims) {
    const stored = await store.get(identityReservationKey(claim));
    assert.equal((stored?.value as { userId: string }).userId, winner.userId);
  }
  // Same-owner reuse is safe but does not itself prove provider/account binding.
  const repeat = { ...winner, operationId: randomUUID() };
  assert.equal(await reservations.begin(repeat), 'preparing');
  assert.equal(await reservations.resume(repeat.operationId), 'reserved');
  assert.equal(
    await reservations.begin({ ...repeat, claims: [...repeat.claims].reverse() }),
    'reserved'
  );
  await assert.rejects(
    reservations.begin({ ...repeat, userId: randomBytes(12).toString('hex') }),
    /ID reused/
  );
  await assert.rejects(
    reservations.begin({ ...repeat, claims: [intent().claims[0]] }),
    /ID reused/
  );

  // Resuming concurrently must not require a lease or permit a different intent.
  const concurrent = intent();
  await reservations.begin(concurrent);
  assert.deepEqual(
    await Promise.all(
      Array.from({ length: 8 }, () =>
        createIdentityReservations(store).resume(concurrent.operationId)
      )
    ),
    Array(8).fill('reserved')
  );

  // Drop each acknowledgement, or fail before each write, including journal creation
  // and terminal CAS. A fresh process resumes using only durable state and saved ID.
  for (const afterCommit of [false, true]) {
    for (let faultAt = 1; faultAt <= 5; faultAt++) {
      const input = intent();
      let writes = 0;
      const fault = async (write: () => Promise<boolean>) => {
        const fail = ++writes === faultAt;
        if (fail && !afterCommit) throw new Error('injected interruption');
        const applied = await write();
        if (fail && afterCommit) throw new Error('injected interruption');
        return applied;
      };
      const interrupted = createIdentityReservations({
        get: (key) => store.get(key),
        create: (...args) => fault(() => store.create(...args)),
        replace: (...args) => fault(() => store.replace(...args)),
      });
      await assert.rejects(async () => {
        await interrupted.begin(input);
        await interrupted.resume(input.operationId);
      }, /injected interruption/);
      const recovered = createIdentityReservations(store);
      // Explicitly repeating begin is needed if the very first journal write never arrived.
      await recovered.begin(input);
      assert.equal(await recovered.resume(input.operationId), 'reserved');
      assert.equal(await recovered.resume(input.operationId), 'reserved');
    }
  }

  // A conflict after an earlier acquisition does not release that claim to a new owner.
  const partial = intent();
  partial.claims[1] = first.claims[1]; // Occupied email; audio sorts before email.
  await reservations.begin(partial);
  assert.equal(await reservations.resume(partial.operationId), 'conflict');
  const retained = await store.get(identityReservationKey(partial.claims[2]));
  assert.equal((retained?.value as { userId: string }).userId, partial.userId);
  assert.equal(await store.get(identityReservationKey(partial.claims[0])), null);
  const steal = { ...intent(), claims: [partial.claims[2]] };
  await reservations.begin(steal);
  assert.equal(await reservations.resume(steal.operationId), 'conflict');
  assert.equal(await reservations.resume(partial.operationId), 'conflict');

  // Losing the terminal conflict acknowledgement must not reopen the operation.
  const conflicted = { ...intent(), claims: [first.claims[1]] };
  await reservations.begin(conflicted);
  const lostConflict = createIdentityReservations({
    get: (key) => store.get(key),
    create: (...args) => store.create(...args),
    replace: async (...args) => {
      await store.replace(...args);
      throw new Error('lost conflict acknowledgement');
    },
  });
  await assert.rejects(
    lostConflict.resume(conflicted.operationId),
    /lost conflict acknowledgement/
  );
  assert.equal(await reservations.resume(conflicted.operationId), 'conflict');

  // Read outages cannot be mistaken for absence, success or permission to overwrite.
  const unreadable = createIdentityReservations({
    ...store,
    get: async () => {
      throw new Error('read unavailable');
    },
  });
  await assert.rejects(unreadable.resume(winner.operationId), /read unavailable/);

  // Exact identities remain distinct across casing, Unicode representation and kinds.
  const marker = randomUUID();
  for (const [kind, value] of [
    ['email', `${marker}A@example.invalid`],
    ['email', `${marker}a@example.invalid`],
    ['provider_id', `${marker}A@example.invalid`],
    ['provider_id', `${marker}é`],
    ['provider_id', `${marker}e\u0301`],
  ] as const) {
    const input = { ...intent(), claims: [{ kind, value }] };
    await reservations.begin(input);
    assert.equal(await reservations.resume(input.operationId), 'reserved');
  }

  // A hash collision/corrupt row must fail closed, even if it names the same owner.
  const corrupt = intent();
  await store.create(identityReservationKey(corrupt.claims[2]), randomUUID(), {
    version: 1,
    userId: corrupt.userId,
    claim: { kind: 'audio_prefix', value: randomBytes(16).toString('hex') },
  });
  await reservations.begin(corrupt);
  await assert.rejects(reservations.resume(corrupt.operationId), /collision or corruption/);
  await assert.rejects(reservations.resume(randomUUID()), /operation not found/);
  const completedClaim = identityReservationKey(repeat.claims[0]);
  const completedRow = await store.get(completedClaim);
  assert.ok(completedRow);
  assert.equal(
    await store.replace(completedClaim, completedRow.revision, randomUUID(), {
      version: 1,
      userId: randomBytes(12).toString('hex'),
      claim: repeat.claims[0],
    }),
    true
  );
  await assert.rejects(reservations.resume(repeat.operationId), /changed owner/);
}
