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
    mkdirSync('.local/cql', { recursive: true, mode: 0o700 });
    writeFileSync(
      path,
      JSON.stringify({ keyspace: config.keyspace, endpoint: graphConfig.url, command }),
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
    process.stdout.write('Seeded linked graph profile and unreceipted CQL publication witness\n');
  } else {
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(manifest.keyspace, config.keyspace);
    assert.equal(manifest.endpoint, graphConfig.url);
    const command = manifest.command as PublishProfile;
    const { userId, snapshotId } = command.snapshot;
    assert.equal((await state.get(profileHeadKey(userId)))?.revision, command.operationId);
    assert.deepEqual(await graph.get(userId, snapshotId), command.snapshot);
    assert.equal(await profiles.resume(command.operationId), 'applied');
    assert.deepEqual(await profiles.read(userId), {
      revision: command.operationId,
      snapshot: command.snapshot,
    });
    const admin = createCqlClient(readCqlConfig('schema'));
    try {
      for (const key of [profileHeadKey(userId), profileOperationKey(command.operationId)]) {
        await admin.execute(
          `DELETE FROM ${config.keyspace}.control_state WHERE scope = ? AND resource_type = ? AND resource_id = ?`,
          [key.scope, key.type, key.id]
        );
        assert.equal(await state.get(key), null);
      }
      for (const identity of [
        profileRevisionIdentity(userId, snapshotId),
        profileUserIdentity(userId),
      ]) {
        await client.execute(findIdentity(identity).hasLabel(identity.kind).drop());
        assert.deepEqual(await client.execute(findIdentity(identity).count()), [0]);
      }
    } finally {
      await admin.close();
    }
    unlinkSync(path);
    process.stdout.write(
      'Verified graph profile/CQL publication recovery and removed exact restart witnesses\n'
    );
  }
} finally {
  await state.close();
}
