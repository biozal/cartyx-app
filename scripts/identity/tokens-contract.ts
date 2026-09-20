import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createIdentityAccountState } from '../../app/server/repositories/identity/account-state';
import { createIdentityAudioAllocator } from '../../app/server/repositories/identity/audio-prefix';
import type { ImmutableProfileStore } from '../../app/server/repositories/identity/profile-model';
import {
  createIdentityReservations,
  type ReservationStateStore,
} from '../../app/server/repositories/identity/reservations';
import {
  createIdentityTokenClearer,
  createTargetIdentityTokens,
  identityTokenClearKey,
  IdentityTokenClearError,
} from '../../app/server/repositories/identity/target-tokens';
import type { IdentityTokenFence } from '../../app/server/repositories/identity/types';
import { createIdentityImporter } from './import-account';
import { settingsAccountFixture } from './settings-contract';

/** Runs unchanged against memory, local Docker and Kubernetes dev stores. */
export async function identityTokensContract(
  state: ReservationStateStore,
  graph: ImmutableProfileStore
) {
  const accounts = createIdentityAccountState(state);
  const tokens = createTargetIdentityTokens(state);
  const clearer = createIdentityTokenClearer(state);
  const fixture = async () => {
    const plan = settingsAccountFixture();
    await createIdentityImporter(state, graph).apply(plan);
    const read = await tokens.readAccessToken(plan.account.binding!.providerId);
    assert.ok(read);
    assert.deepEqual(read.accessToken, plan.account.tokens!.accessToken);
    const fence: IdentityTokenFence = {
      userId: read.userId,
      providerId: read.providerId,
      tokenRevision: read.tokenRevision,
    };
    const login = async () => {
      const operationId = randomUUID();
      await accounts.begin({
        kind: 'login',
        operationId,
        userId: fence.userId,
        expectedRevision: (await accounts.readAccount(fence.userId))!.revision,
        binding: plan.account.binding!,
        tokens: plan.account.tokens!, // Even the identical pair is a new generation.
      });
      assert.equal(await accounts.resume(operationId), 'applied');
      return operationId;
    };
    return { plan, fence, login };
  };
  const first = await fixture();
  const prefix = await createIdentityAudioAllocator(state).resolve(first.fence.userId);
  assert.notEqual(
    (await accounts.readAccount(first.fence.userId))!.revision,
    first.fence.tokenRevision
  );
  assert.equal(await tokens.clearTokens(first.fence), 'cleared');
  assert.equal(await tokens.readAccessToken(first.fence.providerId), null);
  assert.equal((await accounts.readAccount(first.fence.userId))!.audioStoragePrefix, prefix);
  assert.equal(await tokens.clearTokens(first.fence), 'stale');

  const stale = await fixture();
  const newer = await stale.login();
  assert.equal(await tokens.clearTokens(stale.fence), 'stale');
  assert.equal((await tokens.readAccessToken(stale.fence.providerId))!.tokenRevision, newer);
  assert.equal(await tokens.clearTokens({ ...stale.fence, userId: '0'.repeat(24) }), 'stale');
  assert.equal(await tokens.clearTokens({ ...stale.fence, providerId: 'fixture_wrong' }), 'stale');

  // A reservation without the actual binding cannot expose token envelopes.
  const reservations = createIdentityReservations(state);
  for (const userId of [stale.fence.userId, randomBytes(12).toString('hex')]) {
    const providerId = `fixture_tokens_stranded_${randomUUID()}`;
    const id = randomUUID();
    await reservations.begin({
      operationId: id,
      userId,
      claims: [{ kind: 'provider_id', value: providerId }],
    });
    await reservations.resume(id);
    assert.equal(await tokens.readAccessToken(providerId), null);
  }

  // Every write boundary, both before and after commit: intent, attempt pointer,
  // account journal, account CAS, account receipt and coordinator receipt.
  for (const afterCommit of [false, true])
    for (let faultAt = 1; faultAt <= 6; faultAt++) {
      const item = await fixture();
      const id = randomUUID();
      let writes = 0;
      const fault = async <T>(write: () => Promise<T>) => {
        const fail = ++writes === faultAt;
        if (fail && !afterCommit) throw new Error('token clear interruption');
        const result = await write();
        if (fail && afterCommit) throw new Error('token clear interruption');
        return result;
      };
      const interrupted = createIdentityTokenClearer({
        get: (key) => state.get(key),
        create: (...args) => fault(() => state.create(...args)),
        replace: (...args) => fault(() => state.replace(...args)),
      });
      await assert.rejects(async () => {
        await interrupted.begin(id, item.fence);
        await interrupted.resume(id);
      }, /token clear interruption/);
      assert.equal(writes, faultAt);
      const recovered = createIdentityTokenClearer(state);
      await recovered.begin(id, item.fence);
      assert.equal(await recovered.resume(id), 'cleared');
      assert.equal(await tokens.readAccessToken(item.fence.providerId), null);
      assert.ok(
        !JSON.stringify((await state.get(identityTokenClearKey(id)))!.value).includes('ciphertext')
      );
      // A terminal historical receipt never touches a subsequent token generation.
      const currentRevision = await item.login();
      assert.equal(await recovered.resume(id), 'cleared');
      assert.equal((await accounts.readTokens(item.fence.userId))!.tokenRevision, currentRevision);
      await assert.rejects(
        recovered.begin(id, { ...item.fence, tokenRevision: currentRevision }),
        /ID reused/
      );
    }

  const concurrent = await fixture();
  const concurrentId = randomUUID();
  await clearer.begin(concurrentId, concurrent.fence);
  const outcomes = await Promise.all(
    Array.from({ length: 8 }, () => createIdentityTokenClearer(state).resume(concurrentId))
  );
  assert.ok(outcomes.every((outcome) => outcome === 'cleared'));

  // Delay the physical logout CAS until a login or media allocation has advanced
  // the account. The old generation stays fixed when retrying a harmless change.
  for (const change of ['login', 'audio'] as const) {
    const item = await fixture();
    const id = randomUUID();
    let delayed = false;
    let currentRevision = item.fence.tokenRevision;
    const racing = createIdentityTokenClearer({
      get: (key) => state.get(key),
      create: (...args) => state.create(...args),
      replace: async (...args) => {
        if (!delayed && args[0].type === 'identity_account') {
          delayed = true;
          if (change === 'login') currentRevision = await item.login();
          else await createIdentityAudioAllocator(state).resolve(item.fence.userId);
        }
        return state.replace(...args);
      },
    });
    await racing.begin(id, item.fence);
    assert.equal(await racing.resume(id), change === 'login' ? 'stale' : 'cleared');
    assert.ok(delayed);
    if (change === 'login')
      assert.equal((await accounts.readTokens(item.fence.userId))!.tokenRevision, currentRevision);
    else {
      assert.equal(await accounts.readTokens(item.fence.userId), null);
      assert.ok((await accounts.readAccount(item.fence.userId))!.audioStoragePrefix);
    }
  }

  // An uncertain pointer replacement after a rejected account command must retain
  // the original generation, even if another login finishes before explicit resume.
  for (const afterCommit of [false, true]) {
    const item = await fixture();
    const id = randomUUID();
    let raced = false;
    let pointers = 0;
    const interrupted = createIdentityTokenClearer({
      get: (key) => state.get(key),
      create: (...args) => state.create(...args),
      replace: async (...args) => {
        if (!raced && args[0].type === 'identity_account') {
          raced = true;
          await createIdentityAudioAllocator(state).resolve(item.fence.userId);
        }
        const fail = args[0].type === 'identity_token_clear' && ++pointers === 2;
        if (fail && !afterCommit) throw new Error('clear pointer interruption');
        const result = await state.replace(...args);
        if (fail && afterCommit) throw new Error('clear pointer interruption');
        return result;
      },
    });
    await interrupted.begin(id, item.fence);
    await assert.rejects(interrupted.resume(id), /clear pointer interruption/);
    const revision = await item.login();
    assert.equal(await clearer.resume(id), 'stale');
    assert.equal((await accounts.readTokens(item.fence.userId))!.tokenRevision, revision);
  }

  const item = await fixture();
  let writes = 0;
  const unavailable = createTargetIdentityTokens({
    get: async () => {
      throw new Error('token read unavailable');
    },
    create: async () => {
      writes++;
      throw new Error('intent unavailable');
    },
    replace: async () => {
      writes++;
      throw new Error('unexpected write');
    },
  });
  await assert.rejects(
    unavailable.readAccessToken(item.fence.providerId),
    /token read unavailable/
  );
  assert.equal(writes, 0);
  await assert.rejects(unavailable.clearTokens(item.fence), (error: unknown) => {
    assert.ok(error instanceof IdentityTokenClearError);
    assert.match(error.operationId, /^[0-9a-f-]{36}$/);
    assert.ok(!error.message.includes(item.fence.providerId));
    return true;
  });
  assert.equal(writes, 1);
}
