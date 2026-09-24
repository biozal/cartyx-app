import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  createIdentityAccountState,
  identityAccountKey,
  identityAccountOperationKey,
  type AccountCommand,
} from '../../app/server/repositories/identity/account-state';
import {
  createIdentityReservations,
  type ReservationStateStore,
} from '../../app/server/repositories/identity/reservations';

const encrypted = (text: string) => ({
  ciphertext: Buffer.from(text).toString('base64'),
  iv: Buffer.alloc(12).toString('base64'),
  authTag: Buffer.alloc(16).toString('base64'),
});
const tokenPair = (text: string) => ({
  accessToken: encrypted(text),
  refreshToken: encrypted(`${text}-refresh`),
});

/** Same contract runs with in-memory state and real Cassandra, with synthetic tokens only. */
export async function identityAccountStateContract(store: ReservationStateStore) {
  const accounts = createIdentityAccountState(store);
  const reservations = createIdentityReservations(store);
  const run = async (command: AccountCommand) => {
    await accounts.begin(command);
    return accounts.resume(command.operationId);
  };
  const fixture = async () => {
    const userId = randomBytes(12).toString('hex');
    const email = `${userId}@example.invalid`;
    const audioStoragePrefix = randomBytes(16).toString('hex');
    const providerId = `fixture_${userId}`;
    const reservationId = randomUUID();
    await reservations.begin({
      operationId: reservationId,
      userId,
      claims: [
        { kind: 'email', value: email },
        { kind: 'audio_prefix', value: audioStoragePrefix },
        { kind: 'provider_id', value: providerId },
      ],
    });
    assert.equal(await reservations.resume(reservationId), 'reserved');
    const initialize: AccountCommand = {
      kind: 'initialize',
      operationId: randomUUID(),
      userId,
      email,
      audioStoragePrefix,
    };
    return { userId, email, audioStoragePrefix, providerId, initialize };
  };
  const login = (
    f: Awaited<ReturnType<typeof fixture>>,
    expectedRevision: string
  ): AccountCommand => ({
    kind: 'login',
    operationId: randomUUID(),
    userId: f.userId,
    expectedRevision,
    binding: { provider: 'fixture', providerId: f.providerId },
    tokens: tokenPair(randomUUID()),
  });
  const f = await fixture();
  assert.equal(await accounts.readAccount(f.userId), null);
  assert.equal(await run(f.initialize), 'applied');
  assert.equal(await accounts.readTokens(f.userId), null);

  // Two independently reserved providers still cannot bind the same account.
  const otherProvider = `${f.providerId}_other`;
  const otherReservation = randomUUID();
  await reservations.begin({
    operationId: otherReservation,
    userId: f.userId,
    claims: [{ kind: 'provider_id', value: otherProvider }],
  });
  await reservations.resume(otherReservation);
  const first = login(f, f.initialize.operationId);
  const second = login({ ...f, providerId: otherProvider }, f.initialize.operationId);
  await Promise.all([accounts.begin(first), accounts.begin(second)]);
  const outcomes = await Promise.all([
    accounts.resume(first.operationId),
    accounts.resume(second.operationId),
  ]);
  assert.deepEqual([...outcomes].sort(), ['applied', 'rejected']);
  const winner = outcomes[0] === 'applied' ? first : second;
  assert.equal(winner.kind, 'login');
  if (winner.kind !== 'login') throw new Error('fixture command type');
  const activeFixture = { ...f, providerId: winner.binding.providerId };
  const initialTokens = await accounts.readTokens(f.userId);
  assert.deepEqual(initialTokens?.tokens, winner.tokens);
  const accountSnapshot = await accounts.readAccount(f.userId);
  assert.ok(accountSnapshot && !Object.hasOwn(accountSnapshot, 'tokens'));
  assert.equal(accountSnapshot.email, f.email);
  assert.equal(accountSnapshot.audioStoragePrefix, f.audioStoragePrefix);
  const wrongBinding = login(
    { ...f, providerId: winner.binding.providerId === f.providerId ? otherProvider : f.providerId },
    winner.operationId
  );
  assert.equal(await run(wrongBinding), 'rejected');

  const oldLogout: AccountCommand = {
    kind: 'logout',
    operationId: randomUUID(),
    userId: f.userId,
    expectedRevision: winner.operationId,
    expectedTokenRevision: winner.operationId,
    providerId: activeFixture.providerId,
  };
  await accounts.begin(oldLogout);
  const newerLogin = login(activeFixture, winner.operationId);
  assert.equal(await run(newerLogin), 'applied');
  assert.equal(await accounts.resume(oldLogout.operationId), 'rejected');
  assert.equal(
    await run({
      ...oldLogout,
      operationId: randomUUID(),
      expectedRevision: newerLogin.operationId,
    }),
    'rejected',
    'Token revision is checked independently of account revision'
  );
  const beforeClear = await accounts.readTokens(f.userId);
  assert.equal(beforeClear?.tokenRevision, newerLogin.operationId);
  const clear: AccountCommand = {
    ...oldLogout,
    operationId: randomUUID(),
    expectedRevision: newerLogin.operationId,
    expectedTokenRevision: newerLogin.operationId,
  };
  assert.equal(await run(clear), 'applied');
  assert.equal(await accounts.readTokens(f.userId), null);
  // Replaying a historical successful login returns its receipt, never restores tokens.
  assert.equal(await accounts.resume(newerLogin.operationId), 'applied');
  assert.equal(await accounts.readTokens(f.userId), null);
  assert.equal((await accounts.readAccount(f.userId))?.revision, clear.operationId);
  for (const command of [winner, newerLogin, oldLogout, clear]) {
    const receipt = await store.get(identityAccountOperationKey(command.operationId));
    assert.ok(receipt && !Object.hasOwn(receipt.value as object, 'command'));
    assert.ok(!JSON.stringify(receipt.value).includes('ciphertext'));
  }
  await assert.rejects(accounts.begin({ ...clear, providerId: 'different' }), /ID reused/);
  assert.equal(await accounts.begin(clear), 'applied');

  // First-writer wins for account creation too; a new operation cannot overwrite it.
  const repeatInit = { ...f.initialize, operationId: randomUUID() };
  assert.equal(await run(repeatInit), 'rejected');

  // Before/after every write of initialization, login and logout; fresh-instance recovery.
  for (const kind of ['initialize', 'login', 'logout'] as const) {
    for (const afterCommit of [false, true]) {
      for (let faultAt = 1; faultAt <= 3; faultAt++) {
        const fx = await fixture();
        let command: AccountCommand = fx.initialize;
        if (kind !== 'initialize') {
          await run(fx.initialize);
          command = login(fx, fx.initialize.operationId);
        }
        if (kind === 'logout') {
          await run(command);
          command = {
            kind: 'logout',
            operationId: randomUUID(),
            userId: fx.userId,
            expectedRevision: command.operationId,
            expectedTokenRevision: command.operationId,
            providerId: fx.providerId,
          };
        }
        let writes = 0;
        const fault = async (write: () => Promise<boolean>) => {
          const fail = ++writes === faultAt;
          if (fail && !afterCommit) throw new Error('injected account interruption');
          const applied = await write();
          if (fail && afterCommit) throw new Error('injected account interruption');
          return applied;
        };
        const interrupted = createIdentityAccountState({
          get: (key) => store.get(key),
          create: (...args) => fault(() => store.create(...args)),
          replace: (...args) => fault(() => store.replace(...args)),
        });
        await assert.rejects(async () => {
          await interrupted.begin(command);
          await interrupted.resume(command.operationId);
        }, /injected account interruption/);
        const fresh = createIdentityAccountState(store);
        await fresh.begin(command);
        assert.equal(await fresh.resume(command.operationId), 'applied');
        assert.equal((await fresh.readAccount(fx.userId))?.revision, command.operationId);
      }
    }
  }

  // A committed account cannot advance past an unrecorded receipt. This makes
  // historical recovery unambiguous even after the account later advances.
  const pending = await fixture();
  await accounts.begin(pending.initialize);
  const lost = createIdentityAccountState({
    get: (key) => store.get(key),
    replace: (...args) => store.replace(...args),
    create: async (...args) => {
      const applied = await store.create(...args);
      throw new Error(`lost account write ${applied}`);
    },
  });
  await assert.rejects(lost.resume(pending.initialize.operationId), /lost account write true/);
  await assert.rejects(accounts.readAccount(pending.userId), /requires operation recovery/);
  const next = login(pending, pending.initialize.operationId);
  await accounts.begin(next);
  await assert.rejects(accounts.resume(next.operationId), /requires operation recovery/);
  assert.equal(await accounts.resume(pending.initialize.operationId), 'applied');
  assert.equal(await accounts.resume(next.operationId), 'applied');
  assert.equal(await accounts.resume(pending.initialize.operationId), 'applied');
  assert.equal((await accounts.readAccount(pending.userId))?.revision, next.operationId);

  // Multiple workers may resume the same command, with one account transition.
  const parallel = login(pending, next.operationId);
  await accounts.begin(parallel);
  assert.deepEqual(
    await Promise.all(
      Array.from({ length: 8 }, () =>
        createIdentityAccountState(store).resume(parallel.operationId)
      )
    ),
    Array(8).fill('applied')
  );

  // A delayed worker reaches CAS after another worker finishes the same operation
  // and a subsequent login advances again. Its historical receipt must win over
  // its failed stale CAS, without putting old state back.
  const delayedCommand = login(pending, parallel.operationId);
  await accounts.begin(delayedCommand);
  let signalReady!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    signalReady = resolve;
  });
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const delayed = createIdentityAccountState({
    get: (key) => store.get(key),
    create: (...args) => store.create(...args),
    replace: async (key, expected, revision, value) => {
      if (key.type === 'identity_account' && revision === delayedCommand.operationId) {
        signalReady();
        await barrier;
      }
      return store.replace(key, expected, revision, value);
    },
  });
  const delayedResult = delayed.resume(delayedCommand.operationId);
  await Promise.race([
    ready,
    delayedResult.then(() => {
      throw new Error('fixture did not reach CAS barrier');
    }),
  ]);
  const subsequent = login(pending, delayedCommand.operationId);
  try {
    assert.equal(await accounts.resume(delayedCommand.operationId), 'applied');
    assert.equal(await run(subsequent), 'applied');
  } finally {
    release();
  }
  assert.equal(await delayedResult, 'applied');
  assert.equal((await accounts.readTokens(pending.userId))?.tokenRevision, subsequent.operationId);

  const creation = await fixture();
  const initializers = Array.from({ length: 8 }, () => ({
    ...creation.initialize,
    operationId: randomUUID(),
  }));
  await Promise.all(initializers.map((command) => accounts.begin(command)));
  const created = await Promise.all(
    initializers.map((command) => accounts.resume(command.operationId))
  );
  assert.equal(created.filter((outcome) => outcome === 'applied').length, 1);
  assert.equal(created.filter((outcome) => outcome === 'rejected').length, 7);

  const unreserved = login({ ...pending, providerId: 'unreserved_fixture' }, parallel.operationId);
  // Use a fresh unbound account so the reservation check, not binding mismatch, rejects it.
  const emptyUser = randomBytes(12).toString('hex');
  const empty: AccountCommand = {
    kind: 'initialize',
    operationId: randomUUID(),
    userId: emptyUser,
    email: null,
    audioStoragePrefix: null,
  };
  await run(empty);
  const noOwner = { ...unreserved, userId: emptyUser, expectedRevision: empty.operationId };
  await accounts.begin(noOwner);
  await assert.rejects(accounts.resume(noOwner.operationId), /reservation missing/);
  assert.equal((await accounts.readAccount(emptyUser))?.revision, empty.operationId);

  const brokenRead = createIdentityAccountState({
    ...store,
    get: async () => {
      throw new Error('read unavailable');
    },
  });
  await assert.rejects(brokenRead.resume(parallel.operationId), /read unavailable/);
  await assert.rejects(brokenRead.readTokens(pending.userId), /read unavailable/);
  await assert.rejects(accounts.resume(randomUUID()), /operation not found/);
  const row = await store.get(identityAccountKey(emptyUser));
  assert.ok(row);
  await store.replace(identityAccountKey(emptyUser), row.revision, randomUUID(), row.value);
  await assert.rejects(accounts.readAccount(emptyUser), /state mismatch/);
}
