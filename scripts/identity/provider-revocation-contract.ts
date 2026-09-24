import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createIdentityAccountState } from '../../app/server/repositories/identity/account-state';
import {
  createIdentityProviderRevocations,
  identityProviderRevocationKey,
  IdentityProviderRevocationError,
  type IdentityOAuthProvider,
} from '../../app/server/repositories/identity/provider-revocation';
import type { ReservationStateStore } from '../../app/server/repositories/identity/reservations';
import type { ImmutableProfileStore } from '../../app/server/repositories/identity/profile-model';
import { createIdentityLoginCoordinator } from '../../app/server/repositories/identity/target-login';
import { loginFixture } from './login-contract';

/** Real databases, synthetic provider responses only; never contacts an OAuth provider. */
export async function identityProviderRevocationContract(
  state: ReservationStateStore,
  graph: ImmutableProfileStore
) {
  const accounts = createIdentityAccountState(state);
  const revocations = createIdentityProviderRevocations(state);
  const fixture = async (provider: IdentityOAuthProvider = 'google') => {
    const login = createIdentityLoginCoordinator(state, graph);
    const input = { ...loginFixture(), provider };
    const loginPlan = await login.prepare(input);
    await login.begin(loginPlan);
    assert.equal(await login.resume(loginPlan.operationId), 'applied');
    const fence = {
      userId: loginPlan.account.userId,
      providerId: input.providerId,
      tokenRevision: loginPlan.account.operationId,
    };
    const plan = await revocations.prepare(fence, 'fixture.client');
    const newerLogin = async () => {
      const command = {
        ...loginPlan.account,
        operationId: randomUUID(),
        expectedRevision: (await accounts.readAccount(fence.userId))!.revision,
      };
      await accounts.begin(command);
      assert.equal(await accounts.resume(command.operationId), 'applied');
      return command.operationId;
    };
    return { plan, fence, newerLogin };
  };
  for (const provider of ['google', 'github', 'apple'] as const) {
    const item = await fixture(provider);
    await revocations.begin(item.plan);
    let calls = 0;
    const transport = {
      provider,
      clientId: item.plan.clientId,
      send: async () => {
        calls++;
        return provider === 'apple'
          ? { kind: 'skipped' as const, reason: 'apple_logout' as const }
          : { kind: 'http' as const, status: provider === 'google' ? 200 : 204 };
      },
    };
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () =>
        createIdentityProviderRevocations(state).dispatch(item.fence, transport)
      )
    );
    assert.equal(calls, 1);
    assert.ok(outcomes.every((result) => ['attempting', 'response'].includes(result.status)));
    const settled = await Promise.all(
      Array.from({ length: 8 }, () => revocations.resume(item.fence))
    );
    assert.ok(
      settled.every((result) => result.status === 'settled' && result.localOutcome === 'cleared')
    );
    assert.equal(await accounts.readTokens(item.fence.userId), null);
    const newer = await item.newerLogin();
    await revocations.dispatch(item.fence, transport);
    await revocations.resume(item.fence);
    assert.equal(calls, 1);
    assert.equal((await accounts.readTokens(item.fence.userId))?.tokenRevision, newer);
    assert.ok(
      !JSON.stringify((await state.get(identityProviderRevocationKey(item.fence)))!.value).includes(
        'ciphertext'
      )
    );
    await assert.rejects(
      revocations.begin({ ...item.plan, clearOperationId: randomUUID() }),
      /generation reused/
    );
  }

  // HTTP rejection is retained separately from local clearing; never call it revoked.
  for (const status of [400, 401, 429, 500]) {
    const item = await fixture();
    await revocations.begin(item.plan);
    await revocations.dispatch(item.fence, {
      ...item.plan,
      send: async () => ({ kind: 'http', status }),
    });
    assert.deepEqual(await revocations.resume(item.fence), {
      status: 'settled',
      provider: 'google',
      response: { kind: 'http', status },
      localOutcome: 'cleared',
    });
  }

  // The original fence survives a newer login during the external request. That
  // protects stored tokens only; a fake provider cannot prove external grant safety.
  const raced = await fixture();
  await revocations.begin(raced.plan);
  let newer = '';
  await revocations.dispatch(raced.fence, {
    ...raced.plan,
    send: async () => {
      newer = await raced.newerLogin();
      return { kind: 'http', status: 200 };
    },
  });
  assert.equal((await revocations.resume(raced.fence)).localOutcome, 'stale');
  assert.equal((await accounts.readTokens(raced.fence.userId))!.tokenRevision, newer);

  const stale = await fixture();
  await revocations.begin(stale.plan);
  await stale.newerLogin();
  let staleCalls = 0;
  assert.equal(
    (
      await revocations.dispatch(stale.fence, {
        ...stale.plan,
        send: async () => {
          staleCalls++;
          return { kind: 'http', status: 200 };
        },
      })
    ).status,
    'stale'
  );
  assert.equal(staleCalls, 0);

  // Lost HTTP response, decryption failure, timeout or crash after admission leaves
  // attempting forever. Explicit local recovery cannot infer completion or resend.
  const lost = await fixture();
  await revocations.begin(lost.plan);
  let lostCalls = 0;
  const failingTransport = {
    ...lost.plan,
    send: async () => {
      lostCalls++;
      throw new Error('private token URL');
    },
  };
  await assert.rejects(revocations.dispatch(lost.fence, failingTransport), (error: unknown) => {
    assert.ok(error instanceof IdentityProviderRevocationError);
    assert.ok(!JSON.stringify(error).includes('private'));
    assert.ok(!error.message.includes('private'));
    return true;
  });
  assert.equal((await revocations.resume(lost.fence)).status, 'attempting');
  assert.equal((await revocations.dispatch(lost.fence, failingTransport)).status, 'attempting');
  assert.equal(lostCalls, 1);
  assert.equal(
    (await accounts.readTokens(lost.fence.userId))!.tokenRevision,
    lost.fence.tokenRevision
  );

  // Ten physical writes: journal, dispatch claim, HTTP receipt, six token-clear
  // writes, final local receipt. Before/after commit failures never replay HTTP.
  for (const afterCommit of [false, true])
    for (let faultAt = 1; faultAt <= 10; faultAt++) {
      const item = await fixture();
      let writes = 0;
      let calls = 0;
      const fault = async <T>(write: () => Promise<T>) => {
        const fail = ++writes === faultAt;
        if (fail && !afterCommit) throw new Error('revocation interruption');
        const result = await write();
        if (fail && afterCommit) throw new Error('revocation interruption');
        return result;
      };
      const interrupted = createIdentityProviderRevocations({
        get: (key) => state.get(key),
        create: (...args) => fault(() => state.create(...args)),
        replace: (...args) => fault(() => state.replace(...args)),
      });
      const transport = {
        ...item.plan,
        send: async () => {
          calls++;
          return { kind: 'http' as const, status: 200 };
        },
      };
      await assert.rejects(async () => {
        await interrupted.begin(item.plan);
        await interrupted.dispatch(item.fence, transport);
        await interrupted.resume(item.fence);
      });
      assert.equal(writes, faultAt);
      await revocations.begin(item.plan);
      const saved = await revocations.inspect(item.fence);
      // Only a definitively still-prepared journal has an unused dispatch opportunity.
      if (saved.status === 'prepared') await revocations.dispatch(item.fence, transport);
      const recovered = await revocations.resume(item.fence);
      if ((faultAt === 2 && afterCommit) || (faultAt === 3 && !afterCommit)) {
        assert.equal(recovered.status, 'attempting');
        assert.equal(
          (await accounts.readTokens(item.fence.userId))!.tokenRevision,
          item.fence.tokenRevision
        );
      } else {
        assert.equal(recovered.status, 'settled');
        assert.equal(recovered.localOutcome, 'cleared');
        assert.equal(await accounts.readTokens(item.fence.userId), null);
      }
      await revocations.dispatch(item.fence, transport);
      assert.equal(calls, faultAt === 2 && afterCommit ? 0 : 1);
    }
}
