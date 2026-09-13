import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { readCqlConfig } from '../../app/server/db/cql/config';
import { createControlStateStore, type StateKey } from '../../app/server/db/cql/control-state';
import { createCqlClient } from '../../app/server/db/cql/client';
import { readGraphConfig } from '../../app/server/db/graph/config';
import { createGraphClient } from '../../app/server/db/graph/client';
import { findIdentity, type GraphIdentity } from '../../app/server/db/graph/identity';
import {
  createGraphProfileStore,
  profileUserIdentity,
  profileRevisionIdentity,
} from '../../app/server/repositories/identity/graph-profiles';
import {
  createIdentityProfiles,
  profileHeadKey,
  profileOperationKey,
  type PublishProfile,
} from '../../app/server/repositories/identity/profile-head';
import { profileFixture } from './profile-contract';
import { checkIdentityProfileSchema } from './profile-schema';
import {
  createIdentityImporter,
  identityImportKey,
  type IdentityImportPlan,
} from './import-account';
import { mapIdentitySource } from './import-source';
import { importSourceFixture } from './import-contract';
import {
  createIdentityAccountState,
  identityAccountKey,
  identityAccountOperationKey,
} from '../../app/server/repositories/identity/account-state';
import { identityReservationKey } from '../../app/server/repositories/identity/reservations';
import {
  createTargetIdentitySettings,
  IdentityPreferenceWriteError,
} from '../../app/server/repositories/identity/target-settings';
import { createTargetIdentityReader } from '../../app/server/repositories/identity/target-reader';
import { settingsSourceFixture } from './settings-contract';
import {
  createIdentityTokenClearer,
  createTargetIdentityTokens,
} from '../../app/server/repositories/identity/target-tokens';
import type { IdentityTokenFence } from '../../app/server/repositories/identity/types';
import {
  createIdentityLoginCoordinator,
  type IdentityLoginPlan,
} from '../../app/server/repositories/identity/target-login';
import { loginFixture } from './login-contract';
import {
  createIdentityProviderRevocations,
  IdentityProviderRevocationError,
  type ProviderRevocationPlan,
} from '../../app/server/repositories/identity/provider-revocation';
import {
  createIdentityLoginAdmission,
  createAdmissionBoundProviderRevocations,
  IdentityLoginAdmissionError,
  type IdentityAdmissionApplication,
  type IdentityAdmissionTicket,
} from '../../app/server/repositories/identity/login-admission';
import { admissionApplicationFixture } from './login-admission-contract';
import { createIdentityBulkImporter, IdentityBulkImportError } from './bulk-import';
import {
  identityImportTarget,
  prepareIdentityImportPackage,
  loadIdentityImportPackage,
  type IdentityImportTarget,
} from './bulk-package';
import { writeBulkArchiveFixture } from './bulk-contract';
type BulkWitness = {
  keys: StateKey[];
  vertices: GraphIdentity[];
  directory: string;
  target: IdentityImportTarget;
  batchId?: string;
};
type RevocationWitness = {
  keys: StateKey[];
  vertices: GraphIdentity[];
  plan?: ProviderRevocationPlan;
  application?: IdentityAdmissionApplication;
  admissionTicket?: IdentityAdmissionTicket;
};
type LoginWitness = { keys: StateKey[]; vertices: GraphIdentity[]; plan?: IdentityLoginPlan };
type SettingsWitness = {
  plan: IdentityImportPlan;
  keys: StateKey[];
  vertices: GraphIdentity[];
  preferenceOperationId?: string;
  mediaPrefix?: string;
  tokenClearOperationId?: string;
  tokenFence?: IdentityTokenFence;
};

// Fixed synthetic resources are recorded in the private witness before any write.
function importKeys(plan: IdentityImportPlan) {
  return [
    identityImportKey(plan.account.userId),
    identityAccountKey(plan.account.userId),
    identityAccountOperationKey(plan.account.operationId),
    profileHeadKey(plan.account.userId),
    profileOperationKey(plan.profileOperationId),
    { scope: 'global', type: 'identity_reservation_operation', id: plan.reservationOperationId },
    identityReservationKey({ kind: 'email', value: plan.account.email! }),
    identityReservationKey({ kind: 'provider_id', value: plan.account.binding!.providerId }),
    identityReservationKey({ kind: 'audio_prefix', value: plan.account.audioStoragePrefix! }),
  ];
}
const mode = process.argv[2];
if (!['identity-graph-seed', 'identity-graph-verify'].includes(mode))
  throw new Error('Invalid graph persistence mode');
const config = readCqlConfig('runtime');
const graphConfig = readGraphConfig();
await checkIdentityProfileSchema(graphConfig);
const state = createControlStateStore(config);
const client = createGraphClient(graphConfig);
const graph = createGraphProfileStore(client);
const profiles = createIdentityProfiles(state, graph);
const path = '.local/cql/identity-graph-persistence.json';
const tracking = (
  witness: {
    keys: StateKey[];
    vertices: GraphIdentity[];
    mediaPrefix?: string;
  },
  save: () => void
) => {
  const track = (key: StateKey) => {
    if (!witness.keys.some((item) => JSON.stringify(item) === JSON.stringify(key)))
      witness.keys.push(key);
    save();
  };
  const trackedState = {
    get: (key: StateKey) => state.get(key),
    create: (...args: Parameters<typeof state.create>) => {
      if (args[0].type === 'identity_audio_assignment')
        witness.mediaPrefix = (args[2] as { prefix: string }).prefix;
      track(args[0]);
      return state.create(...args);
    },
    replace: (...args: Parameters<typeof state.replace>) => {
      track(args[0]);
      return state.replace(...args);
    },
  };
  const trackedGraph: typeof graph = {
    get: (...args) => graph.get(...args),
    put: (snapshot) => {
      for (const identity of [
        profileUserIdentity(snapshot.userId),
        profileRevisionIdentity(snapshot.userId, snapshot.snapshotId),
      ])
        if (!witness.vertices.some((item) => JSON.stringify(item) === JSON.stringify(identity)))
          witness.vertices.push(identity);
      save();
      return graph.put(snapshot);
    },
  };
  return { trackedState, trackedGraph };
};
try {
  if (mode === 'identity-graph-seed') {
    if (existsSync(path)) throw new Error('Recover existing identity graph witness before seeding');
    const command: PublishProfile = {
      operationId: randomUUID(),
      expectedRevision: null,
      snapshot: profileFixture(),
    };
    const importPlan = mapIdentitySource(importSourceFixture());
    const settingsWitness: SettingsWitness = {
      plan: mapIdentitySource(settingsSourceFixture()),
      keys: [],
      vertices: [],
    };
    const tokenWitness: SettingsWitness = {
      plan: mapIdentitySource(settingsSourceFixture()),
      keys: [],
      vertices: [],
    };
    const loginWitness: LoginWitness = { keys: [], vertices: [] };
    const revocationWitnesses: RevocationWitness[] = [
      { keys: [], vertices: [] },
      { keys: [], vertices: [] },
    ];
    const bulkWitness: BulkWitness = {
      keys: [],
      vertices: [],
      directory: `.local/cql/identity-bulk-${randomUUID()}`,
      target: identityImportTarget('local', config, graphConfig),
    };
    const manifest = {
      keyspace: config.keyspace,
      endpoint: graphConfig.url,
      command,
      importPlan,
      settingsWitness,
      tokenWitness,
      loginWitness,
      revocationWitnesses,
      bulkWitness,
    };
    mkdirSync('.local/cql', { recursive: true, mode: 0o700 });
    writeFileSync(path, JSON.stringify(manifest), { mode: 0o600, flag: 'wx' });
    await profiles.begin(command);
    const interrupted = createIdentityProfiles(
      {
        get: (key) => state.get(key),
        replace: (...args) => state.replace(...args),
        create: async (...args) => {
          await state.create(...args);
          throw new Error('graph publication witness interruption');
        },
      },
      graph
    );
    await assert.rejects(
      interrupted.resume(command.operationId),
      /graph publication witness interruption/
    );
    await assert.rejects(profiles.read(command.snapshot.userId), /requires operation recovery/);
    assert.deepEqual(
      await graph.get(command.snapshot.userId, command.snapshot.snapshotId),
      command.snapshot
    );
    const interruptedImport = createIdentityImporter(
      {
        get: (key) => state.get(key),
        create: (...args) => state.create(...args),
        replace: async (...args) => {
          const result = await state.replace(...args);
          if (args[0].type === 'identity_account_operation')
            throw new Error('import witness interruption');
          return result;
        },
      },
      graph
    );
    await assert.rejects(interruptedImport.apply(importPlan), /import witness interruption/);
    await assert.rejects(
      createIdentityImporter(state, graph).verify(importPlan),
      /requires recovery/
    );
    const save = () => {
      writeFileSync(`${path}.pending`, JSON.stringify(manifest), { mode: 0o600 });
      renameSync(`${path}.pending`, path);
    };
    const { trackedState, trackedGraph } = tracking(settingsWitness, save);
    await createIdentityImporter(trackedState, trackedGraph).apply(settingsWitness.plan);
    const interruptedSettings = createTargetIdentitySettings(
      {
        ...trackedState,
        replace: async (...args) => {
          if (args[0].type === 'identity_profile_head') {
            settingsWitness.preferenceOperationId = args[2];
            save();
          }
          const result = await trackedState.replace(...args);
          if (['identity_profile_head', 'identity_account'].includes(args[0].type))
            throw new Error('settings witness interruption');
          return result;
        },
      },
      trackedGraph
    );
    await assert.rejects(
      interruptedSettings.setRulerColor(
        settingsWitness.plan.account.binding!.providerId,
        '#aB9876'
      ),
      (error: unknown) =>
        error instanceof IdentityPreferenceWriteError && error.outcome === 'uncertain'
    );
    await assert.rejects(
      interruptedSettings.resolveAudioStoragePrefix(settingsWitness.plan.account.userId),
      /settings witness interruption/
    );
    const trackedTokens = tracking(tokenWitness, save);
    await createIdentityImporter(trackedTokens.trackedState, trackedTokens.trackedGraph).apply(
      tokenWitness.plan
    );
    const observed = (await createTargetIdentityTokens(state).readAccessToken(
      tokenWitness.plan.account.binding!.providerId
    ))!;
    tokenWitness.tokenFence = {
      userId: observed.userId,
      providerId: observed.providerId,
      tokenRevision: observed.tokenRevision,
    };
    tokenWitness.tokenClearOperationId = randomUUID();
    save();
    const interruptedClear = createIdentityTokenClearer({
      ...trackedTokens.trackedState,
      replace: async (...args) => {
        const result = await trackedTokens.trackedState.replace(...args);
        if (args[0].type === 'identity_account')
          throw new Error('token clear witness interruption');
        return result;
      },
    });
    await interruptedClear.begin(tokenWitness.tokenClearOperationId, tokenWitness.tokenFence);
    await assert.rejects(
      interruptedClear.resume(tokenWitness.tokenClearOperationId),
      /token clear witness interruption/
    );
    await assert.rejects(
      createIdentityAccountState(state).readAccount(observed.userId),
      /requires operation recovery/
    );
    const trackedLogin = tracking(loginWitness, save);
    const login = createIdentityLoginCoordinator(
      trackedLogin.trackedState,
      trackedLogin.trackedGraph
    );
    loginWitness.plan = await login.prepare(loginFixture());
    save(); // Retain the canonical selected ID and complete plan before any login writes.
    await login.begin(loginWitness.plan);
    const interruptedLogin = createIdentityLoginCoordinator(
      {
        ...trackedLogin.trackedState,
        replace: async (...args) => {
          const result = await trackedLogin.trackedState.replace(...args);
          if (args[0].type === 'identity_account') throw new Error('login witness interruption');
          return result;
        },
      },
      trackedLogin.trackedGraph
    );
    await assert.rejects(
      interruptedLogin.resume(loginWitness.plan.operationId),
      /login witness interruption/
    );
    await assert.rejects(
      createIdentityAccountState(state).readAccount(loginWitness.plan.account.userId),
      /requires operation recovery/
    );
    for (const [index, witness] of revocationWitnesses.entries()) {
      const tracked = tracking(witness, save);
      witness.application = admissionApplicationFixture();
      save();
      const admission = createIdentityLoginAdmission(tracked.trackedState, witness.application);
      await admission.initialize();
      witness.admissionTicket = await admission.issue();
      save();
      const login = createIdentityLoginCoordinator(tracked.trackedState, tracked.trackedGraph);
      await login.recordLogin({ ...loginFixture(), provider: 'google' });
      // The synthetic login's account key was recorded before its first mutation.
      const key = witness.keys.find((key) => key.type === 'identity_account')!;
      const account = (await createIdentityAccountState(state).readAccount(key.scope.slice(5)))!;
      const revocations = createIdentityProviderRevocations(tracked.trackedState);
      witness.plan = await revocations.prepare(
        {
          userId: account.userId,
          providerId: account.binding!.providerId,
          tokenRevision: account.tokenRevision!,
        },
        witness.application.clientId
      );
      save();
      // Commit the closure but lose its acknowledgement before the revocation journal.
      await assert.rejects(
        createIdentityLoginAdmission(
          {
            ...tracked.trackedState,
            replace: async (...args) => {
              await tracked.trackedState.replace(...args);
              throw new Error('synthetic admission acknowledgement loss');
            },
          },
          witness.application
        ).block(),
        IdentityLoginAdmissionError
      );
      await assert.rejects(admission.assert(witness.admissionTicket), IdentityLoginAdmissionError);
      await createAdmissionBoundProviderRevocations(
        tracked.trackedState,
        witness.application
      ).begin(witness.plan);
      if (index === 0) {
        await revocations.dispatch(witness.plan.fence, {
          ...witness.plan,
          send: async () => ({ kind: 'http', status: 200 }),
        });
        const interrupted = createIdentityProviderRevocations({
          ...tracked.trackedState,
          replace: async (...args) => {
            const result = await tracked.trackedState.replace(...args);
            if (args[0].type === 'identity_account')
              throw new Error('provider local clear interruption');
            return result;
          },
        });
        await assert.rejects(
          interrupted.resume(witness.plan.fence),
          IdentityProviderRevocationError
        );
      } else {
        await assert.rejects(
          revocations.dispatch(witness.plan.fence, {
            ...witness.plan,
            send: async () => {
              throw new Error('synthetic lost provider response');
            },
          }),
          IdentityProviderRevocationError
        );
      }
    }
    mkdirSync(bulkWitness.directory, { mode: 0o700 });
    await writeBulkArchiveFixture(`${bulkWitness.directory}/source`);
    const bulkDirectory = `${bulkWitness.directory}/package`;
    await prepareIdentityImportPackage(
      `${bulkWitness.directory}/source`,
      bulkDirectory,
      bulkWitness.target
    );
    bulkWitness.batchId = (
      await loadIdentityImportPackage(bulkDirectory, bulkWitness.target)
    ).manifest.batchId;
    save();
    const trackedBulk = tracking(bulkWitness, save);
    const interruptedBulk = createIdentityBulkImporter(
      {
        ...trackedBulk.trackedState,
        create: async (...args) => {
          const result = await trackedBulk.trackedState.create(...args);
          if (args[0].type === 'identity_account')
            throw new Error('bulk account witness interruption');
          return result;
        },
      },
      trackedBulk.trackedGraph,
      bulkWitness.target
    );
    await assert.rejects(interruptedBulk.apply(bulkDirectory), IdentityBulkImportError);
    const pendingBulk = await loadIdentityImportPackage(bulkDirectory, bulkWitness.target);
    await assert.rejects(
      createIdentityAccountState(state).readAccount(pendingBulk.plans[0].account.userId),
      /requires operation recovery/
    );
    assert.equal(
      await createIdentityAccountState(state).readAccount(pendingBulk.plans[1].account.userId),
      null
    );
    process.stdout.write(
      'Seeded graph publication, pending account import, preference/media allocation, token clear, login, provider attempt/local-clear and closed OAuth admission and private bulk-package restart witnesses\n'
    );
  } else {
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(manifest.keyspace, config.keyspace);
    assert.equal(manifest.endpoint, graphConfig.url);
    const command = manifest.command as PublishProfile;
    const importPlan = manifest.importPlan as IdentityImportPlan | undefined;
    const settingsWitness = manifest.settingsWitness as SettingsWitness | undefined;
    const tokenWitness = manifest.tokenWitness as SettingsWitness | undefined;
    const loginWitness = manifest.loginWitness as LoginWitness | undefined;
    const revocationWitnesses = (manifest.revocationWitnesses ?? []) as RevocationWitness[];
    const bulkWitness = manifest.bulkWitness as BulkWitness | undefined;
    const { userId, snapshotId } = command.snapshot;
    assert.equal((await state.get(profileHeadKey(userId)))?.revision, command.operationId);
    assert.deepEqual(await graph.get(userId, snapshotId), command.snapshot);
    assert.equal(await profiles.resume(command.operationId), 'applied');
    assert.deepEqual(await profiles.read(userId), {
      revision: command.operationId,
      snapshot: command.snapshot,
    });
    // Accept older profile-only witness files so operators can finish an earlier run.
    if (importPlan) {
      assert.equal(
        (await state.get(identityAccountKey(importPlan.account.userId)))?.revision,
        importPlan.account.operationId
      );
      const importer = createIdentityImporter(state, graph);
      await importer.apply(importPlan);
      await importer.verify(importPlan);
    }
    if (settingsWitness) {
      assert.ok(settingsWitness.preferenceOperationId);
      const settings = createTargetIdentitySettings(state, graph);
      const prefix = await settings.resolveAudioStoragePrefix(settingsWitness.plan.account.userId);
      assert.equal(prefix, settingsWitness.mediaPrefix);
      assert.equal(await profiles.resume(settingsWitness.preferenceOperationId), 'applied');
      const reader = createTargetIdentityReader(state, graph);
      assert.equal(
        await reader.lookupAudioStoragePrefix(settingsWitness.plan.account.userId),
        prefix
      );
      assert.deepEqual(
        await reader.readPreferences(settingsWitness.plan.account.binding!.providerId),
        { rulerColor: '#aB9876' }
      );
      const tokens = await createIdentityAccountState(state).readTokens(
        settingsWitness.plan.account.userId
      );
      assert.equal(tokens?.tokenRevision, settingsWitness.plan.account.operationId);
      assert.deepEqual(tokens?.tokens, settingsWitness.plan.account.tokens);
    }
    if (tokenWitness) {
      assert.ok(tokenWitness.tokenClearOperationId);
      assert.ok(tokenWitness.tokenFence);
      const clearer = createIdentityTokenClearer(state);
      assert.equal(await clearer.resume(tokenWitness.tokenClearOperationId), 'cleared');
      assert.equal(
        await createTargetIdentityTokens(state).readAccessToken(tokenWitness.tokenFence.providerId),
        null
      );
      const account = await createIdentityAccountState(state).readAccount(
        tokenWitness.tokenFence.userId
      );
      assert.ok(account);
      assert.notEqual(account.tokenRevision, tokenWitness.tokenFence.tokenRevision);
      assert.deepEqual(account.binding, tokenWitness.plan.account.binding);
      assert.deepEqual((await profiles.read(account.userId))!.snapshot, tokenWitness.plan.snapshot);
    }
    if (loginWitness) {
      assert.ok(loginWitness.plan);
      const plan = loginWitness.plan;
      const login = createIdentityLoginCoordinator(state, graph);
      assert.equal(await login.resume(plan.operationId), 'applied');
      const account = await createIdentityAccountState(state).readTokens(plan.account.userId);
      assert.equal(account?.tokenRevision, plan.account.operationId);
      assert.deepEqual(account?.tokens, plan.account.tokens);
      assert.deepEqual((await profiles.read(plan.account.userId))!.snapshot, plan.profile.snapshot);
      assert.equal(
        await createTargetIdentityReader(state, graph).findUserId(plan.account.binding.providerId),
        plan.account.userId
      );
    }
    for (const [index, witness] of revocationWitnesses.entries()) {
      assert.ok(witness.plan);
      const revocations = createIdentityProviderRevocations(state);
      if (witness.application) {
        assert.ok(witness.admissionTicket);
        const admission = createIdentityLoginAdmission(state, witness.application);
        assert.deepEqual(await admission.inspect(), { status: 'blocked' });
        await assert.rejects(
          admission.assert(witness.admissionTicket),
          IdentityLoginAdmissionError
        );
        await assert.rejects(admission.issue(), IdentityLoginAdmissionError);
        await assert.rejects(admission.initialize(), IdentityLoginAdmissionError);
        await createAdmissionBoundProviderRevocations(state, witness.application).resume(
          witness.plan
        );
        await assert.rejects(admission.issue(), IdentityLoginAdmissionError);
      }
      const result = await revocations.resume(witness.plan.fence);
      assert.equal(result.status, index === 0 ? 'settled' : 'attempting');
      if (index === 0) {
        assert.equal(result.localOutcome, 'cleared');
        assert.deepEqual(result.response, { kind: 'http', status: 200 });
        assert.equal(
          await createIdentityAccountState(state).readTokens(witness.plan.fence.userId),
          null
        );
      } else {
        assert.equal(
          (await createIdentityAccountState(state).readTokens(witness.plan.fence.userId))!
            .tokenRevision,
          witness.plan.fence.tokenRevision
        );
      }
      await revocations.dispatch(witness.plan.fence, {
        ...witness.plan,
        send: async () => {
          assert.fail('Restart recovery must not repeat provider HTTP');
        },
      });
    }
    if (bulkWitness) {
      assert.match(bulkWitness.directory, /^\.local\/cql\/identity-bulk-[0-9a-f-]{36}$/);
      const target = identityImportTarget('local', config, graphConfig);
      assert.deepEqual(target, bulkWitness.target);
      const directory = `${bulkWitness.directory}/package`;
      const batch = await loadIdentityImportPackage(directory, target);
      assert.equal(batch.manifest.batchId, bulkWitness.batchId);
      const tracked = tracking(bulkWitness, () => {
        writeFileSync(`${path}.pending`, JSON.stringify(manifest), { mode: 0o600 });
        renameSync(`${path}.pending`, path);
      });
      const runner = createIdentityBulkImporter(tracked.trackedState, tracked.trackedGraph, target);
      await runner.apply(directory);
      await runner.verify(directory);
      assert.deepEqual(await loadIdentityImportPackage(directory, target), batch);
    }
    const admin = createCqlClient(readCqlConfig('schema'));
    try {
      for (const key of [
        profileHeadKey(userId),
        profileOperationKey(command.operationId),
        ...(importPlan ? importKeys(importPlan) : []),
        ...(settingsWitness?.keys ?? []),
        ...(tokenWitness?.keys ?? []),
        ...(loginWitness?.keys ?? []),
        ...revocationWitnesses.flatMap((witness) => witness.keys),
        ...(bulkWitness?.keys ?? []),
      ]) {
        await admin.execute(
          `DELETE FROM ${config.keyspace}.control_state WHERE scope = ? AND resource_type = ? AND resource_id = ?`,
          [key.scope, key.type, key.id]
        );
        assert.equal(await state.get(key), null);
      }
      for (const identity of [
        profileRevisionIdentity(userId, snapshotId),
        profileUserIdentity(userId),
        ...(importPlan
          ? [
              profileRevisionIdentity(importPlan.account.userId, importPlan.snapshot.snapshotId),
              profileUserIdentity(importPlan.account.userId),
            ]
          : []),
        ...(settingsWitness?.vertices ?? []),
        ...(tokenWitness?.vertices ?? []),
        ...(loginWitness?.vertices ?? []),
        ...revocationWitnesses.flatMap((witness) => witness.vertices),
        ...(bulkWitness?.vertices ?? []),
      ]) {
        await client.execute(findIdentity(identity).hasLabel(identity.kind).drop());
        assert.deepEqual(await client.execute(findIdentity(identity).count()), [0]);
      }
    } finally {
      await admin.close();
    }
    if (bulkWitness) rmSync(bulkWitness.directory, { recursive: true });
    unlinkSync(path);
    process.stdout.write(
      'Verified graph publication, account import, preference/media allocation, token clear, login, provider attempt/local-clear recovery without HTTP replay, durable OAuth admission refusal and exact private bulk-package recovery without remapping; removed exact restart witnesses\n'
    );
  }
} finally {
  await state.close();
}
