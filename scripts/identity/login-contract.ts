import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  createIdentityAccountState,
  identityAccountKey,
} from '../../app/server/repositories/identity/account-state';
import { createIdentityProfiles } from '../../app/server/repositories/identity/profile-head';
import type { ImmutableProfileStore } from '../../app/server/repositories/identity/profile-model';
import {
  createIdentityReservations,
  type ReservationStateStore,
} from '../../app/server/repositories/identity/reservations';
import {
  createIdentityLoginCoordinator,
  createTargetIdentityLogin,
  identityLoginKey,
  IdentityLoginError,
} from '../../app/server/repositories/identity/target-login';
import { createTargetIdentityReader } from '../../app/server/repositories/identity/target-reader';
import { createTargetIdentitySettings } from '../../app/server/repositories/identity/target-settings';
import { createTargetIdentityTokens } from '../../app/server/repositories/identity/target-tokens';
import type { RecordIdentityLogin } from '../../app/server/repositories/identity/types';
import { createIdentityImporter } from './import-account';
import { accountPlanFixture } from './account-fixture';

export function loginFixture(): RecordIdentityLogin {
  const id = randomBytes(12).toString('hex');
  const envelope = {
    ciphertext: randomBytes(32).toString('base64'),
    iv: randomBytes(12).toString('base64'),
    authTag: randomBytes(16).toString('base64'),
  };
  return {
    provider: 'fixture',
    providerId: `fixture_login_${id}`,
    email: `Exact+${id}@Example.invalid`,
    firstName: 'New name',
    oauthTokens: { accessToken: envelope, refreshToken: { ...envelope } },
    lastLoginAt: new Date('2026-09-13T20:00:00.000Z'),
  };
}

export async function identityLoginContract(
  state: ReservationStateStore,
  graph: ImmutableProfileStore
) {
  const coordinator = createIdentityLoginCoordinator(state, graph);
  const identity = createTargetIdentityLogin(state, graph);
  const accounts = createIdentityAccountState(state);
  const profiles = createIdentityProfiles(state, graph);
  const reader = createTargetIdentityReader(state, graph);
  const settings = createTargetIdentitySettings(state, graph);
  const tokens = createTargetIdentityTokens(state);
  const reservations = createIdentityReservations(state);
  const fixture = async (bound = true) => {
    const plan = accountPlanFixture({ bound, audioStoragePrefix: false });
    await createIdentityImporter(state, graph).apply(plan);
    const request = {
      ...loginFixture(),
      email: plan.account.email!,
      ...(bound && { providerId: plan.account.binding!.providerId }),
    };
    return { plan, request };
  };

  const input = loginFixture();
  const fresh = await identity.recordLogin(input);
  assert.match(fresh.id, /^[0-9a-f]{24}$/);
  assert.equal(fresh.role, 'unknown');
  assert.equal(fresh.firstName, input.firstName);
  assert.deepEqual(
    Object.keys(fresh).sort(),
    ['id', 'email', 'firstName', 'lastName', 'avatarUrl', 'role'].sort()
  );
  assert.equal(
    (await profiles.read(fresh.id))!.snapshot.content.createdAt,
    input.lastLoginAt.toISOString()
  );
  assert.deepEqual((await accounts.readTokens(fresh.id))!.tokens, input.oauthTokens);
  assert.equal(await reader.findProfile(input.providerId.toUpperCase()), null);
  const noEmail = loginFixture();
  delete noEmail.email;
  delete noEmail.firstName;
  assert.equal((await identity.recordLogin(noEmail)).email, null);
  const tokenless = { ...loginFixture(), oauthTokens: { accessToken: null, refreshToken: null } };
  assert.equal((await identity.recordLogin(tokenless)).role, 'unknown');

  for (const bound of [false, true]) {
    const item = await fixture(bound);
    delete item.request.firstName;
    const prefix = await settings.resolveAudioStoragePrefix(item.plan.account.userId);
    const planned = await coordinator.prepare(item.request);
    assert.equal(planned.selectedBy, bound ? 'provider' : 'email');
    assert.equal(planned.account.userId, item.plan.account.userId);
    const result = await identity.recordLogin({
      ...item.request,
      role: 'player',
      preferences: {},
      audioStoragePrefix: 'b'.repeat(32),
    } as RecordIdentityLogin);
    assert.equal(result.id, item.plan.account.userId);
    assert.equal(result.role, 'gm');
    assert.equal(result.firstName, item.plan.snapshot.content.firstName);
    assert.equal(result.lastName, null);
    assert.deepEqual((await profiles.read(result.id))!.snapshot.content, {
      ...item.plan.snapshot.content,
      lastLoginAt: item.request.lastLoginAt.toISOString(),
    });
    assert.equal((await accounts.readAccount(result.id))!.audioStoragePrefix, prefix);
  }

  // Provider-first selection never claims a second account through an incoming email.
  const provider = await fixture();
  const email = await fixture(false);
  const conflict = await coordinator.prepare({
    ...provider.request,
    email: email.plan.account.email!,
  });
  assert.equal(conflict.selectedBy, 'provider');
  assert.equal(conflict.account.userId, provider.plan.account.userId);
  await coordinator.begin(conflict);
  assert.equal(await coordinator.resume(conflict.operationId), 'rejected');
  assert.equal((await accounts.readAccount(email.plan.account.userId))!.binding, null);
  assert.equal(
    (await accounts.readTokens(provider.plan.account.userId))!.tokenRevision,
    provider.plan.account.operationId
  );
  await assert.rejects(
    coordinator.prepare({ ...loginFixture(), email: provider.plan.account.email! }),
    /cannot select/
  );
  await assert.rejects(
    coordinator.prepare({ ...provider.request, provider: 'other-provider' }),
    /cannot select/
  );

  // Held-but-unbound provider reservations and old email reservations are not accounts.
  for (const kind of ['provider_id', 'email'] as const) {
    const request = loginFixture();
    const operationId = randomUUID();
    await reservations.begin({
      operationId,
      userId: randomBytes(12).toString('hex'),
      claims: [{ kind, value: kind === 'email' ? request.email! : request.providerId }],
    });
    await reservations.resume(operationId);
    await assert.rejects(coordinator.prepare(request), /cannot select/);
  }
  const held = await fixture(false);
  const holdId = randomUUID();
  await reservations.begin({
    operationId: holdId,
    userId: held.plan.account.userId,
    claims: [{ kind: 'provider_id', value: held.request.providerId }],
  });
  await reservations.resume(holdId);
  await assert.rejects(coordinator.prepare(held.request), /cannot select/);

  // All composite write boundaries for registration, including graph.put. Same
  // retained plan/IDs recover in a fresh coordinator; no remapping or session result.
  for (const afterCommit of [false, true])
    for (let faultAt = 1; faultAt <= 16; faultAt++) {
      const request = loginFixture();
      const plan = await coordinator.prepare(request);
      let writes = 0;
      const fault = async <T>(write: () => Promise<T>) => {
        const fail = ++writes === faultAt;
        if (fail && !afterCommit) throw new Error('login write interruption');
        const result = await write();
        if (fail && afterCommit) throw new Error('login write interruption');
        return result;
      };
      const interrupted = createIdentityLoginCoordinator(
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
        await interrupted.begin(plan);
        await interrupted.resume(plan.operationId);
      }, /login write interruption/);
      assert.equal(writes, faultAt);
      const recovery = createIdentityLoginCoordinator(state, graph);
      await recovery.begin(plan);
      assert.equal(await recovery.resume(plan.operationId), 'applied');
      assert.equal(await reader.findUserId(request.providerId), plan.account.userId);
      assert.deepEqual(
        (await accounts.readTokens(plan.account.userId))!.tokens,
        request.oauthTokens
      );
      const receipt = (await state.get(identityLoginKey(plan.operationId)))!.value;
      assert.ok(!JSON.stringify(receipt).includes('ciphertext'));
      assert.ok(!Object.hasOwn(receipt as object, 'plan'));
      await assert.rejects(
        recovery.begin({
          ...plan,
          account: { ...plan.account, tokens: { accessToken: null, refreshToken: null } },
        }),
        /ID reused/
      );
    }

  const parallelPlan = await coordinator.prepare(loginFixture());
  await coordinator.begin(parallelPlan);
  const parallel = await Promise.allSettled(
    Array.from({ length: 8 }, () =>
      createIdentityLoginCoordinator(state, graph).resume(parallelPlan.operationId)
    )
  );
  for (const attempt of parallel) {
    if (attempt.status === 'rejected')
      assert.match(String(attempt.reason), /Graph request (failed|conflict)/);
    else assert.equal(attempt.value, 'applied');
  }
  // Wait for every worker before recovery/cleanup. Graph lock contention is an
  // uncertain write, not permission to retry implicitly or require every call to win.
  assert.equal(await coordinator.resume(parallelPlan.operationId), 'applied');
  for (const returning of [false, true]) {
    const request = returning ? (await fixture()).request : loginFixture();
    const plans = await Promise.all(Array.from({ length: 6 }, () => coordinator.prepare(request)));
    await Promise.all(plans.map((plan) => coordinator.begin(plan)));
    const attempts = await Promise.allSettled(
      plans.map((plan) => coordinator.resume(plan.operationId))
    );
    for (const attempt of attempts)
      if (attempt.status === 'rejected')
        assert.match(String(attempt.reason), /Graph request (failed|conflict)/);
    const outcomes = [];
    for (const plan of plans) outcomes.push(await coordinator.resume(plan.operationId));
    assert.equal(outcomes.filter((outcome) => outcome === 'applied').length, 1);
    const winner = plans[outcomes.indexOf('applied')];
    assert.equal(await reader.findUserId(request.providerId), winner.account.userId);
    assert.equal(
      (await accounts.readTokens(winner.account.userId))!.tokenRevision,
      winner.account.operationId
    );
  }

  // Login loses cleanly to a preference or media writer captured after preparation.
  for (const change of ['preference', 'audio'] as const) {
    const item = await fixture();
    const plan = await coordinator.prepare(item.request);
    await coordinator.begin(plan);
    if (change === 'preference') await settings.setRulerColor(item.request.providerId, '#123456');
    else await settings.resolveAudioStoragePrefix(item.plan.account.userId);
    assert.equal(await coordinator.resume(plan.operationId), 'rejected');
    assert.equal(
      (await accounts.readTokens(item.plan.account.userId))!.tokenRevision,
      item.plan.account.operationId
    );
    if (change === 'preference')
      assert.equal((await reader.readPreferences(item.request.providerId))!.rulerColor, '#123456');
    else assert.ok((await accounts.readAccount(item.plan.account.userId))!.audioStoragePrefix);
  }

  // A delayed graph writer cannot select stale names after a newer full login.
  const delayed = await fixture();
  const old = await coordinator.prepare(delayed.request);
  await coordinator.begin(old);
  let delayedOnce = false;
  const racing = createIdentityLoginCoordinator(state, {
    get: (...args) => graph.get(...args),
    put: async (snapshot) => {
      if (!delayedOnce) {
        delayedOnce = true;
        await identity.recordLogin({ ...delayed.request, firstName: 'Newer name' });
      }
      await graph.put(snapshot);
    },
  });
  assert.equal(await racing.resume(old.operationId), 'rejected');
  assert.equal((await reader.findProfile(delayed.request.providerId))!.firstName, 'Newer name');

  // A newer login can finish after the old profile was selected but before its
  // account command. Replaying the old plan cannot restore either old component.
  const split = await fixture();
  let splitOnce = false;
  const splitCoordinator = createIdentityLoginCoordinator(
    {
      get: (key) => state.get(key),
      replace: (...args) => state.replace(...args),
      create: async (...args) => {
        if (
          !splitOnce &&
          args[0].type === 'identity_account_operation' &&
          (args[2] as { command?: { kind: string } }).command?.kind === 'login'
        ) {
          splitOnce = true;
          await identity.recordLogin({ ...split.request, firstName: 'Winning name' });
        }
        return state.create(...args);
      },
    },
    graph
  );
  const splitPlan = await splitCoordinator.prepare(split.request);
  await splitCoordinator.begin(splitPlan);
  assert.equal(await splitCoordinator.resume(splitPlan.operationId), 'rejected');
  const winningTokens = await accounts.readTokens(split.plan.account.userId);
  assert.equal(await coordinator.resume(splitPlan.operationId), 'rejected');
  assert.deepEqual(await accounts.readTokens(split.plan.account.userId), winningTokens);
  assert.equal((await reader.findProfile(split.request.providerId))!.firstName, 'Winning name');

  // Reject a torn preparation snapshot: another login between the account and
  // profile reads must not give the old input a newer profile CAS precondition.
  const torn = await fixture();
  let advanced = false;
  const preparing = createIdentityLoginCoordinator(
    {
      ...state,
      get: async (key) => {
        const row = await state.get(key);
        if (
          !advanced &&
          JSON.stringify(key) === JSON.stringify(identityAccountKey(torn.plan.account.userId))
        ) {
          advanced = true;
          await identity.recordLogin({ ...torn.request, firstName: 'Current name' });
        }
        return row;
      },
      create: (...args) => state.create(...args),
      replace: (...args) => state.replace(...args),
    },
    graph
  );
  await assert.rejects(preparing.prepare(torn.request), /changed during selection/);

  // Superseding state after the component receipts but before the result prevents
  // session/profile return. Historical recovery still returns only its old outcome.
  for (const change of ['login', 'logout', 'preference', 'audio'] as const) {
    const item = await fixture();
    let operationId = '';
    let changed = false;
    const finishing = createIdentityLoginCoordinator(
      {
        get: (key) => state.get(key),
        create: (...args) => state.create(...args),
        replace: async (...args) => {
          const result = await state.replace(...args);
          if (
            !changed &&
            args[0].type === 'identity_login' &&
            (args[3] as { status: string }).status === 'applied'
          ) {
            changed = true;
            operationId = args[0].id;
            if (change === 'login')
              await identity.recordLogin({ ...item.request, firstName: 'Latest name' });
            if (change === 'logout') {
              const observed = (await tokens.readAccessToken(item.request.providerId))!;
              await tokens.clearTokens({
                userId: observed.userId,
                providerId: observed.providerId,
                tokenRevision: observed.tokenRevision,
              });
            }
            if (change === 'preference')
              await settings.setRulerColor(item.request.providerId, '#abcdef');
            if (change === 'audio')
              await settings.resolveAudioStoragePrefix(item.plan.account.userId);
          }
          return result;
        },
      },
      graph
    );
    if (change === 'audio')
      assert.equal((await finishing.recordLogin(item.request)).id, item.plan.account.userId);
    else
      await assert.rejects(
        finishing.recordLogin(item.request),
        (error: unknown) => error instanceof IdentityLoginError && error.outcome === 'superseded'
      );
    const before = await accounts.readAccount(item.plan.account.userId);
    const profileBefore = await profiles.read(item.plan.account.userId);
    assert.equal(await coordinator.resume(operationId), 'applied');
    assert.deepEqual(await accounts.readAccount(item.plan.account.userId), before);
    assert.deepEqual(await profiles.read(item.plan.account.userId), profileBefore);
  }

  // A media write inside the final read interval must fail the account bracket,
  // even though it leaves the token generation intact.
  const bracket = await fixture();
  let completed = false;
  let interruptedRead = false;
  const bracketing = createIdentityLoginCoordinator(
    {
      get: (key) => state.get(key),
      create: (...args) => state.create(...args),
      replace: async (...args) => {
        const result = await state.replace(...args);
        if (
          args[0].type === 'identity_login' &&
          (args[3] as { status: string }).status === 'applied'
        )
          completed = true;
        return result;
      },
    },
    {
      put: (snapshot) => graph.put(snapshot),
      get: async (...args) => {
        if (completed && !interruptedRead) {
          interruptedRead = true;
          await settings.resolveAudioStoragePrefix(bracket.plan.account.userId);
        }
        return graph.get(...args);
      },
    }
  );
  await assert.rejects(
    bracketing.recordLogin(bracket.request),
    (error: unknown) => error instanceof IdentityLoginError && error.outcome === 'superseded'
  );
  assert.ok(interruptedRead);
}
