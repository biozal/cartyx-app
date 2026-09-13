import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { readCqlConfig } from '../../app/server/db/cql/config';
import { createControlStateStore } from '../../app/server/db/cql/control-state';
import { createCqlClient } from '../../app/server/db/cql/client';
import { readGraphConfig } from '../../app/server/db/graph/config';
import { createGraphClient } from '../../app/server/db/graph/client';
import { findIdentity } from '../../app/server/db/graph/identity';
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
  identityAccountKey,
  identityAccountOperationKey,
} from '../../app/server/repositories/identity/account-state';
import { identityReservationKey } from '../../app/server/repositories/identity/reservations';

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
    mkdirSync('.local/cql', { recursive: true, mode: 0o700 });
    writeFileSync(
      path,
      JSON.stringify({ keyspace: config.keyspace, endpoint: graphConfig.url, command, importPlan }),
      { mode: 0o600, flag: 'wx' }
    );
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
    process.stdout.write('Seeded graph publication and pending account import restart witnesses\n');
  } else {
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(manifest.keyspace, config.keyspace);
    assert.equal(manifest.endpoint, graphConfig.url);
    const command = manifest.command as PublishProfile;
    const importPlan = manifest.importPlan as IdentityImportPlan | undefined;
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
    const admin = createCqlClient(readCqlConfig('schema'));
    try {
      for (const key of [
        profileHeadKey(userId),
        profileOperationKey(command.operationId),
        ...(importPlan ? importKeys(importPlan) : []),
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
      ]) {
        await client.execute(findIdentity(identity).hasLabel(identity.kind).drop());
        assert.deepEqual(await client.execute(findIdentity(identity).count()), [0]);
      }
    } finally {
      await admin.close();
    }
    unlinkSync(path);
    process.stdout.write(
      'Verified graph profile/CQL publication and account import recovery; removed exact restart witnesses\n'
    );
  }
} finally {
  await state.close();
}
