import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  createAdmissionBoundIdentityLogin,
  createAdmissionBoundProviderRevocations,
  createIdentityLoginAdmission,
  identityLoginAdmissionKey,
  IdentityLoginAdmissionError,
  type IdentityAdmissionApplication,
} from '../../app/server/repositories/identity/login-admission';
import {
  createIdentityLoginCoordinator,
  IdentityLoginError,
} from '../../app/server/repositories/identity/target-login';
import { createIdentityProviderRevocations } from '../../app/server/repositories/identity/provider-revocation';
import type { ReservationStateStore } from '../../app/server/repositories/identity/reservations';
import type { ImmutableProfileStore } from '../../app/server/repositories/identity/profile-model';
import { loginFixture } from './login-contract';

export const admissionApplicationFixture = (): IdentityAdmissionApplication => ({
  provider: 'google',
  clientId: `fixture.${randomUUID()}`,
  projectId: `fixture.${randomUUID()}`,
});

/** Same contract on memory and real stores. All transport calls are synthetic. */
export async function identityLoginAdmissionContract(
  state: ReservationStateStore,
  graph: ImmutableProfileStore
) {
  const app = admissionApplicationFixture();
  const admission = createIdentityLoginAdmission(state, app);
  await assert.rejects(admission.issue(), IdentityLoginAdmissionError);
  await assert.rejects(admission.block(), IdentityLoginAdmissionError);
  await Promise.all(Array.from({ length: 8 }, () => admission.initialize()));
  const ticket = await admission.issue(); // Before the simulated provider authorization starts.
  await admission.initialize();
  await admission.assert(ticket); // Bootstrap replay did not change its epoch.
  const boundLogin = createAdmissionBoundIdentityLogin(state, graph, app);
  const request = { ...loginFixture(), provider: app.provider };
  assert.ok((await boundLogin.recordLogin(ticket, request)).id);

  // Google client IDs in one project share the barrier, but not each other's tickets.
  assert.equal(app.provider, 'google');
  const siblingApp = { ...app, clientId: `fixture.${randomUUID()}` };
  const sibling = createIdentityLoginAdmission(state, siblingApp);
  assert.deepEqual(identityLoginAdmissionKey(app), identityLoginAdmissionKey(siblingApp));
  await assert.rejects(sibling.assert(ticket), IdentityLoginAdmissionError);
  const siblingTicket = await sibling.issue();
  await Promise.all(Array.from({ length: 8 }, () => sibling.block()));
  await assert.rejects(admission.assert(ticket), IdentityLoginAdmissionError);
  await assert.rejects(sibling.assert(siblingTicket), IdentityLoginAdmissionError);
  await assert.rejects(admission.issue(), IdentityLoginAdmissionError);
  await assert.rejects(admission.initialize(), IdentityLoginAdmissionError);
  await assert.rejects(boundLogin.recordLogin(ticket, request), IdentityLoginAdmissionError);
  // A delayed response with new preparation time cannot mint new admission.
  await assert.rejects(
    boundLogin.recordLogin(ticket, { ...request, lastLoginAt: new Date() }),
    IdentityLoginAdmissionError
  );

  // Separate projects/clients remain independent. Apple never dispatches external logout here.
  for (const provider of ['google', 'github', 'apple'] as const) {
    const config: IdentityAdmissionApplication =
      provider === 'google'
        ? admissionApplicationFixture()
        : { provider, clientId: `fixture.${randomUUID()}` };
    const separate = createIdentityLoginAdmission(state, config);
    await separate.initialize();
    await separate.assert(await separate.issue());
  }

  // Closure during read-only selection is caught again before any login journal.
  const preparingApp = admissionApplicationFixture();
  const preparingGate = createIdentityLoginAdmission(state, preparingApp);
  await preparingGate.initialize();
  const preparingTicket = await preparingGate.issue();
  let loginWrites = 0;
  await assert.rejects(
    createAdmissionBoundIdentityLogin(
      {
        ...state,
        get: async (key) => {
          if (key.type === 'identity_reservation') await preparingGate.block();
          return state.get(key);
        },
        create: async (...args) => {
          loginWrites++;
          return state.create(...args);
        },
      },
      graph,
      preparingApp
    ).recordLogin(preparingTicket, { ...loginFixture(), provider: 'google' }),
    IdentityLoginError
  );
  assert.equal(loginWrites, 0);

  // GitHub HTTP success, failure and configured skip are distinct evidence, and
  // none permits reopening. Direct dispatch still closes before journal/HTTP.
  for (const response of [
    { kind: 'http' as const, status: 204 },
    { kind: 'http' as const, status: 422 },
    { kind: 'skipped' as const, reason: 'github_credentials' as const },
  ]) {
    const config = { provider: 'github' as const, clientId: `fixture.${randomUUID()}` };
    const gate = createIdentityLoginAdmission(state, config);
    await gate.initialize();
    const pending = await gate.issue();
    const login = createIdentityLoginCoordinator(state, graph);
    const loginPlan = await login.prepare({ ...loginFixture(), provider: 'github' });
    await login.begin(loginPlan);
    await login.resume(loginPlan.operationId);
    const plan = await createIdentityProviderRevocations(state).prepare(
      {
        userId: loginPlan.account.userId,
        providerId: loginPlan.account.binding.providerId,
        tokenRevision: loginPlan.account.operationId,
      },
      config.clientId
    );
    const safe = createAdmissionBoundProviderRevocations(state, config);
    let calls = 0;
    const transport = {
      ...plan,
      send: async () => {
        calls++;
        await assert.rejects(gate.assert(pending), IdentityLoginAdmissionError);
        return response;
      },
    };
    await safe.dispatch(plan, transport);
    assert.deepEqual((await safe.resume(plan)).response, response);
    await assert.rejects(gate.issue(), IdentityLoginAdmissionError);
    await assert.rejects(safe.dispatch({ ...plan, clearOperationId: randomUUID() }, transport));
    assert.equal(calls, 1);
  }

  // Closure during a committed login prevents its DTO from escaping. The durable
  // operation remains historical and is never undone or restored by admission.
  const racedApp = admissionApplicationFixture();
  const racedAdmission = createIdentityLoginAdmission(state, racedApp);
  await racedAdmission.initialize();
  const racedTicket = await racedAdmission.issue();
  let operationId = '';
  const racingState: ReservationStateStore = {
    ...state,
    create: async (...args) => {
      const result = await state.create(...args);
      if (args[0].type === 'identity_login') {
        operationId = args[0].id;
        await racedAdmission.block();
      }
      return result;
    },
  };
  await assert.rejects(
    createAdmissionBoundIdentityLogin(racingState, graph, racedApp).recordLogin(racedTicket, {
      ...loginFixture(),
      provider: 'google',
    }),
    (error: unknown) => {
      assert.ok(error instanceof IdentityLoginError);
      assert.equal(error.operationId, operationId);
      return true;
    }
  );
  assert.equal(await createIdentityLoginCoordinator(state, graph).resume(operationId), 'applied');
  await assert.rejects(racedAdmission.assert(racedTicket), IdentityLoginAdmissionError);

  // All barrier/journal begin write boundaries before/after commit. Uncertainty
  // never reaches dispatch, and explicit recovery closes admission first.
  for (const afterCommit of [false, true])
    for (let faultAt = 1; faultAt <= 2; faultAt++) {
      const config = admissionApplicationFixture();
      const gate = createIdentityLoginAdmission(state, config);
      await gate.initialize();
      const pending = await gate.issue();
      const login = createIdentityLoginCoordinator(state, graph);
      const loginPlan = await login.prepare({ ...loginFixture(), provider: 'google' });
      await login.begin(loginPlan);
      await login.resume(loginPlan.operationId);
      const revocations = createIdentityProviderRevocations(state);
      const plan = await revocations.prepare(
        {
          userId: loginPlan.account.userId,
          providerId: loginPlan.account.binding.providerId,
          tokenRevision: loginPlan.account.operationId,
        },
        config.clientId
      );
      let writes = 0;
      const fault = async <T>(write: () => Promise<T>) => {
        const fail = ++writes === faultAt;
        if (fail && !afterCommit) throw new Error('private barrier driver data');
        const result = await write();
        if (fail && afterCommit) throw new Error('private barrier driver data');
        return result;
      };
      const interrupted = createAdmissionBoundProviderRevocations(
        {
          get: (key) => state.get(key),
          create: (...args) => fault(() => state.create(...args)),
          replace: (...args) => fault(() => state.replace(...args)),
        },
        config
      );
      let calls = 0;
      const transport = {
        ...plan,
        send: async () => {
          calls++;
          await assert.rejects(gate.assert(pending), IdentityLoginAdmissionError);
          return { kind: 'http' as const, status: 200 };
        },
      };
      await assert.rejects(async () => {
        await interrupted.begin(plan);
        await interrupted.dispatch(plan, transport);
      });
      assert.equal(calls, 0);
      const safe = createAdmissionBoundProviderRevocations(state, config);
      await safe.begin(plan); // Exact retained plan, explicit recovery.
      await Promise.all(Array.from({ length: 8 }, () => safe.dispatch(plan, transport)));
      assert.equal(calls, 1);
      assert.equal((await safe.resume(plan)).status, 'settled');
      await assert.rejects(gate.issue(), IdentityLoginAdmissionError);
      await assert.rejects(gate.initialize(), IdentityLoginAdmissionError);
      await safe.dispatch(plan, transport);
      assert.equal(calls, 1);
    }

  // False CAS is not proof of closure; the reconciled row must actually be blocked.
  const falseApp = admissionApplicationFixture();
  const falseGate = createIdentityLoginAdmission(state, falseApp);
  await falseGate.initialize();
  await assert.rejects(
    createIdentityLoginAdmission({ ...state, replace: async () => false }, falseApp).block(),
    IdentityLoginAdmissionError
  );
  await falseGate.assert(await falseGate.issue());
}
