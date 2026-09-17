import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { createIdentityAccountState } from '../../app/server/repositories/identity/account-state';
import { identityAudioAssignmentKey } from '../../app/server/repositories/identity/audio-prefix';
import {
  createIdentityProfiles,
  profileOperationKey,
} from '../../app/server/repositories/identity/profile-head';
import type { ImmutableProfileStore } from '../../app/server/repositories/identity/profile-model';
import {
  createIdentityReservations,
  type ReservationStateStore,
} from '../../app/server/repositories/identity/reservations';
import { createTargetIdentityReader } from '../../app/server/repositories/identity/target-reader';
import {
  createTargetIdentitySettings,
  IdentityPreferenceWriteError,
} from '../../app/server/repositories/identity/target-settings';
import { createIdentityImporter } from './import-account';
import { accountPlanFixture } from './account-fixture';

/** A bound account whose audio namespace is still unallocated. */
export const settingsAccountFixture = () => accountPlanFixture({ audioStoragePrefix: false });

export async function identitySettingsContract(
  state: ReservationStateStore,
  graph: ImmutableProfileStore
) {
  const importer = createIdentityImporter(state, graph);
  const accounts = createIdentityAccountState(state);
  const profiles = createIdentityProfiles(state, graph);
  const reader = createTargetIdentityReader(state, graph);
  const settings = createTargetIdentitySettings(state, graph);
  const fixture = async () => {
    const plan = settingsAccountFixture();
    await importer.apply(plan);
    return plan;
  };
  const original = await fixture();
  const userId = original.account.userId;
  const providerId = original.account.binding!.providerId;
  await settings.setRulerColor(providerId, '#Ff0011');
  assert.deepEqual((await profiles.read(userId))?.snapshot.content, {
    ...original.snapshot.content,
    rulerColor: '#Ff0011',
  });
  assert.equal((await accounts.readAccount(userId))?.revision, original.account.operationId);
  assert.deepEqual((await accounts.readTokens(userId))?.tokens, original.account.tokens);
  await settings.setRulerColor(`missing_${randomUUID()}`, '#123456');
  await assert.rejects(settings.setRulerColor(providerId, 'red'));

  // A delayed preference snapshot cannot overwrite a newer profile's names or role.
  let release!: () => void;
  let reached!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const delayed = createTargetIdentitySettings(state, {
    get: (...args) => graph.get(...args),
    put: async (snapshot) => {
      reached();
      await barrier;
      await graph.put(snapshot);
    },
  });
  const stale = delayed.setRulerColor(providerId, '#001122');
  // Attach the handler before allowing the rejected operation to finish.
  const staleOutcome = assert.rejects(
    stale,
    (error: unknown) =>
      error instanceof IdentityPreferenceWriteError && error.outcome === 'rejected'
  );
  await ready;
  const current = (await profiles.read(userId))!;
  const newerProfile = {
    operationId: randomUUID(),
    expectedRevision: current.revision,
    snapshot: {
      ...current.snapshot,
      snapshotId: randomBytes(12).toString('hex'),
      content: { ...current.snapshot.content, firstName: 'Updated name', role: 'player' as const },
    },
  };
  try {
    await profiles.begin(newerProfile);
    assert.equal(await profiles.resume(newerProfile.operationId), 'applied');
  } finally {
    release();
  }
  await staleOutcome;
  assert.deepEqual((await profiles.read(userId))?.snapshot, newerProfile.snapshot);

  // Recovery references contain no profile content and never silently rebase old edits.
  for (const afterCommit of [false, true])
    for (let faultAt = 1; faultAt <= 4; faultAt++) {
      let writes = 0;
      const fault = async <T>(write: () => Promise<T>) => {
        const fail = ++writes === faultAt;
        if (fail && !afterCommit) throw new Error('settings interruption');
        const result = await write();
        if (fail && afterCommit) throw new Error('settings interruption');
        return result;
      };
      const interrupted = createTargetIdentitySettings(
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
      let reference!: IdentityPreferenceWriteError;
      await assert.rejects(interrupted.setRulerColor(providerId, '#aB1234'), (error: unknown) => {
        assert.ok(error instanceof IdentityPreferenceWriteError);
        assert.equal(error.outcome, 'uncertain');
        assert.equal(JSON.stringify(error).includes(providerId), false);
        reference = error;
        return true;
      });
      assert.equal(writes, faultAt);
      if (await state.get(profileOperationKey(reference.operationId)))
        assert.equal(await profiles.resume(reference.operationId), 'applied');
      else await settings.setRulerColor(providerId, '#aB1234');
      assert.deepEqual(await reader.readPreferences(providerId), { rulerColor: '#aB1234' });
      assert.equal((await profiles.read(userId))?.snapshot.content.role, 'player');
    }

  const beforeTokens = await accounts.readTokens(userId);
  const beforeProfile = await profiles.read(userId);
  const candidates: string[] = [];
  const allocating = createTargetIdentitySettings(state, graph, () => {
    const candidate = randomBytes(16).toString('hex');
    candidates.push(candidate);
    return candidate;
  });
  const uploads = await Promise.allSettled(
    Array.from({ length: 8 }, () => allocating.resolveAudioStoragePrefix(userId))
  );
  const namespaces: string[] = [];
  for (const upload of uploads) {
    if (upload.status === 'fulfilled') namespaces.push(upload.value);
    else {
      // A caller whose first intent read predates the winner may encounter that
      // winner's pending account receipt. An explicit new resolve recovers it.
      assert.match(String(upload.reason), /Identity account requires operation recovery/);
      namespaces.push(await allocating.resolveAudioStoragePrefix(userId));
    }
  }
  assert.equal(new Set(namespaces).size, 1);
  assert.ok(candidates.includes(namespaces[0]));
  assert.equal(await reader.lookupAudioStoragePrefix(userId), namespaces[0]);
  assert.equal((await accounts.readTokens(userId))?.tokenRevision, beforeTokens?.tokenRevision);
  assert.deepEqual((await accounts.readTokens(userId))?.tokens, beforeTokens?.tokens);
  assert.deepEqual(await profiles.read(userId), beforeProfile);
  assert.equal(
    await createTargetIdentitySettings(state, graph, () => {
      throw new Error('Must not remint');
    }).resolveAudioStoragePrefix(userId),
    namespaces[0]
  );

  const reservations = createIdentityReservations(state);
  const replacement = randomBytes(16).toString('hex');
  const reservationId = randomUUID();
  await reservations.begin({
    operationId: reservationId,
    userId,
    claims: [{ kind: 'audio_prefix', value: replacement }],
  });
  await reservations.resume(reservationId);
  const replaceId = randomUUID();
  await accounts.begin({
    kind: 'assign_audio',
    operationId: replaceId,
    userId,
    expectedRevision: (await accounts.readAccount(userId))!.revision,
    audioStoragePrefix: replacement,
  });
  assert.equal(await accounts.resume(replaceId), 'rejected');
  assert.equal(await reader.lookupAudioStoragePrefix(userId), namespaces[0]);

  const laterLogin = randomUUID();
  await accounts.begin({
    kind: 'login',
    operationId: laterLogin,
    userId,
    expectedRevision: (await accounts.readAccount(userId))!.revision,
    binding: original.account.binding!,
    tokens: { accessToken: null, refreshToken: null },
  });
  await accounts.resume(laterLogin);
  assert.equal(await settings.resolveAudioStoragePrefix(userId), namespaces[0]);
  assert.equal((await accounts.readAccount(userId))?.revision, laterLogin);
  assert.deepEqual((await accounts.readTokens(userId))?.tokens, {
    accessToken: null,
    refreshToken: null,
  });

  const collision = await fixture();
  const colliding = createTargetIdentitySettings(state, graph, () => namespaces[0]);
  await assert.rejects(
    colliding.resolveAudioStoragePrefix(collision.account.userId),
    /belongs to another account/
  );
  await assert.rejects(
    colliding.resolveAudioStoragePrefix(collision.account.userId),
    /belongs to another account/
  );
  assert.equal(await reader.lookupAudioStoragePrefix(collision.account.userId), null);
  await assert.rejects(
    settings.resolveAudioStoragePrefix(randomBytes(12).toString('hex')),
    /User not found/
  );

  // Every allocation write boundary: intent, reservation journal/claim/receipt,
  // account journal/CAS/receipt. A fresh allocator resumes from the per-user intent.
  for (const afterCommit of [false, true])
    for (let faultAt = 1; faultAt <= 7; faultAt++) {
      const plan = await fixture();
      let writes = 0;
      const fault = async <T>(write: () => Promise<T>) => {
        const fail = ++writes === faultAt;
        if (fail && !afterCommit) throw new Error('allocation interruption');
        const result = await write();
        if (fail && afterCommit) throw new Error('allocation interruption');
        return result;
      };
      const interrupted = createTargetIdentitySettings(
        {
          get: (key) => state.get(key),
          create: (...args) => fault(() => state.create(...args)),
          replace: (...args) => fault(() => state.replace(...args)),
        },
        graph
      );
      await assert.rejects(
        interrupted.resolveAudioStoragePrefix(plan.account.userId),
        /allocation interruption/
      );
      assert.equal(writes, faultAt);
      const assigned = await createTargetIdentitySettings(state, graph).resolveAudioStoragePrefix(
        plan.account.userId
      );
      assert.equal(await reader.lookupAudioStoragePrefix(plan.account.userId), assigned);
      assert.deepEqual(
        (await accounts.readTokens(plan.account.userId))?.tokens,
        plan.account.tokens
      );
    }

  // A login can advance the account between candidate preparation and assignment.
  // Rebase only after the first account CAS has a definitive rejected receipt.
  const raced = await fixture();
  let racedLogin = false;
  const racing = createTargetIdentitySettings(
    {
      get: (key) => state.get(key),
      replace: (...args) => state.replace(...args),
      create: async (...args) => {
        const result = await state.create(...args);
        if (!racedLogin && args[0].type === 'identity_audio_assignment') {
          racedLogin = true;
          const loginId = randomUUID();
          await accounts.begin({
            kind: 'login',
            operationId: loginId,
            userId: raced.account.userId,
            expectedRevision: raced.account.operationId,
            binding: raced.account.binding!,
            tokens: { accessToken: null, refreshToken: null },
          });
          await accounts.resume(loginId);
        }
        return result;
      },
    },
    graph
  );
  const prefix = await racing.resolveAudioStoragePrefix(raced.account.userId);
  assert.equal(await reader.lookupAudioStoragePrefix(raced.account.userId), prefix);
  assert.deepEqual((await accounts.readTokens(raced.account.userId))?.tokens, {
    accessToken: null,
    refreshToken: null,
  });
  assert.ok(await state.get(identityAudioAssignmentKey(raced.account.userId)));

  // Recover an uncertain attempt-pointer advance after a concurrent login rejects
  // the first account CAS. The persisted media candidate must never change.
  for (const afterCommit of [false, true]) {
    const plan = await fixture();
    let loginInserted = false;
    let interrupted = false;
    let minted = 0;
    const allocator = createTargetIdentitySettings(
      {
        get: (key) => state.get(key),
        create: async (...args) => {
          const result = await state.create(...args);
          if (!loginInserted && args[0].type === 'identity_audio_assignment') {
            loginInserted = true;
            const id = randomUUID();
            await accounts.begin({
              kind: 'login',
              operationId: id,
              userId: plan.account.userId,
              expectedRevision: plan.account.operationId,
              binding: plan.account.binding!,
              tokens: { accessToken: null, refreshToken: null },
            });
            await accounts.resume(id);
          }
          return result;
        },
        replace: async (...args) => {
          const fail = !interrupted && args[0].type === 'identity_audio_assignment';
          if (fail) interrupted = true;
          if (fail && !afterCommit) throw new Error('attempt pointer interruption');
          const result = await state.replace(...args);
          if (fail && afterCommit) throw new Error('attempt pointer interruption');
          return result;
        },
      },
      graph,
      () => {
        minted++;
        return randomBytes(16).toString('hex');
      }
    );
    await assert.rejects(
      allocator.resolveAudioStoragePrefix(plan.account.userId),
      /attempt pointer interruption/
    );
    const intent = (await state.get(identityAudioAssignmentKey(plan.account.userId)))!.value as {
      prefix: string;
    };
    assert.equal(await settings.resolveAudioStoragePrefix(plan.account.userId), intent.prefix);
    assert.equal(minted, 1);
  }

  const wrongProvider = `fixture_settings_wrong_${randomUUID()}`;
  const wrongReservation = randomUUID();
  await reservations.begin({
    operationId: wrongReservation,
    userId,
    claims: [{ kind: 'provider_id', value: wrongProvider }],
  });
  await reservations.resume(wrongReservation);
  const unchanged = await profiles.read(userId);
  await settings.setRulerColor(wrongProvider, '#ffffff');
  assert.deepEqual(await profiles.read(userId), unchanged);
}
