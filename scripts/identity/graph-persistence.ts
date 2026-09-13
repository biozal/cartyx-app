import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  renameSync,
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
    const manifest = {
      keyspace: config.keyspace,
      endpoint: graphConfig.url,
      command,
      importPlan,
      settingsWitness,
      tokenWitness,
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
    const tracking = (witness: SettingsWitness) => {
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
    const { trackedState, trackedGraph } = tracking(settingsWitness);
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
    const trackedTokens = tracking(tokenWitness);
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
    process.stdout.write(
      'Seeded graph publication, pending account import, preference/media allocation and token clear restart witnesses\n'
    );
  } else {
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(manifest.keyspace, config.keyspace);
    assert.equal(manifest.endpoint, graphConfig.url);
    const command = manifest.command as PublishProfile;
    const importPlan = manifest.importPlan as IdentityImportPlan | undefined;
    const settingsWitness = manifest.settingsWitness as SettingsWitness | undefined;
    const tokenWitness = manifest.tokenWitness as SettingsWitness | undefined;
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
    const admin = createCqlClient(readCqlConfig('schema'));
    try {
      for (const key of [
        profileHeadKey(userId),
        profileOperationKey(command.operationId),
        ...(importPlan ? importKeys(importPlan) : []),
        ...(settingsWitness?.keys ?? []),
        ...(tokenWitness?.keys ?? []),
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
      ]) {
        await client.execute(findIdentity(identity).hasLabel(identity.kind).drop());
        assert.deepEqual(await client.execute(findIdentity(identity).count()), [0]);
      }
    } finally {
      await admin.close();
    }
    unlinkSync(path);
    process.stdout.write(
      'Verified graph publication, account import, preference/media allocation and token clear recovery; removed exact restart witnesses\n'
    );
  }
} finally {
  await state.close();
}
