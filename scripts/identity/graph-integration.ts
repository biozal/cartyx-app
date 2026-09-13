import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, renameSync, unlinkSync, readFileSync } from 'node:fs';
import gremlin from 'gremlin';
import { readCqlConfig } from '../../app/server/db/cql/config';
import { createControlStateStore, type StateKey } from '../../app/server/db/cql/control-state';
import { createCqlClient } from '../../app/server/db/cql/client';
import { readGraphConfig } from '../../app/server/db/graph/config';
import { createGraphClient } from '../../app/server/db/graph/client';
import { findIdentity, type GraphIdentity } from '../../app/server/db/graph/identity';
import { submitGraphRequest } from '../../app/server/db/graph/transport';
import {
  createGraphProfileStore,
  profileUserIdentity,
  profileRevisionIdentity,
} from '../../app/server/repositories/identity/graph-profiles';
import type { ProfileSnapshot } from '../../app/server/repositories/identity/profile-model';
import { checkIdentityProfileSchema } from './profile-schema';
import { identityProfileContract, profileFixture } from './profile-contract';
import { identityImportContract } from './import-contract';
import { identitySettingsContract } from './settings-contract';
const config = readCqlConfig('runtime');
const graphConfig = readGraphConfig();
const state = createControlStateStore(config);
const admin = createCqlClient(readCqlConfig('schema'));
const client = createGraphClient(graphConfig);
const graph = createGraphProfileStore(client);
const keys: StateKey[] = [];
const vertices: GraphIdentity[] = [];
mkdirSync('.local/identity-graph-runs', { recursive: true, mode: 0o700 });
const recovery = process.argv[2];
if (recovery && !/^\.local\/identity-graph-runs\/[0-9a-f]{24}\.json$/.test(recovery))
  throw new Error('Expected an exact generated fixture manifest');
const manifest = recovery ?? `.local/identity-graph-runs/${randomBytes(12).toString('hex')}.json`;
if (recovery) {
  const saved = JSON.parse(readFileSync(manifest, 'utf8'));
  assert.equal(saved.keyspace, config.keyspace);
  assert.equal(saved.endpoint, graphConfig.url);
  keys.push(...saved.keys);
  vertices.push(...saved.vertices);
}
function save() {
  writeFileSync(
    `${manifest}.tmp`,
    JSON.stringify({ keyspace: config.keyspace, endpoint: graphConfig.url, keys, vertices }),
    { mode: 0o600 }
  );
  renameSync(`${manifest}.tmp`, manifest);
}
function trackKey(key: StateKey) {
  if (!keys.some((item) => JSON.stringify(item) === JSON.stringify(key))) {
    keys.push(key);
    save();
  }
}
function trackSnapshot(snapshot: ProfileSnapshot) {
  for (const identity of [
    profileUserIdentity(snapshot.userId),
    profileRevisionIdentity(snapshot.userId, snapshot.snapshotId),
  ]) {
    if (!vertices.some((item) => JSON.stringify(item) === JSON.stringify(identity)))
      vertices.push(identity);
  }
  save();
}
save();
try {
  if (!recovery) {
    await checkIdentityProfileSchema(graphConfig);
    await Promise.all([
      checkIdentityProfileSchema(graphConfig, true),
      checkIdentityProfileSchema(graphConfig, true),
    ]);
    await assert.rejects(
      submitGraphRequest(
        graphConfig,
        readFileSync(new URL('./0001-profile-schema.groovy', import.meta.url), 'utf8'),
        { applySchema: true, checksum: 'incorrect' }
      ),
      /Graph request failed/
    );
    for (const contract of [
      identityProfileContract,
      identityImportContract,
      identitySettingsContract,
    ])
      await contract(
        {
          get: (key) => state.get(key),
          create: (key, revision, value) => {
            trackKey(key);
            return state.create(key, revision, value);
          },
          replace: (key, expected, revision, value) => {
            trackKey(key);
            return state.replace(key, expected, revision, value);
          },
        },
        {
          get: (...args) => graph.get(...args),
          put: (snapshot) => {
            trackSnapshot(snapshot);
            return graph.put(snapshot);
          },
        }
      );

    const mutates = (bytecode: gremlin.process.Bytecode): boolean => {
      const visit = (item: unknown): boolean =>
        Array.isArray(item) &&
        ((typeof item[0] === 'string' && ['addV', 'addE', 'property'].includes(item[0])) ||
          item.some(visit));
      return visit(JSON.parse(bytecode.toString()));
    };
    // Interrupt each physical graph write: owner, revision, edge. Resume repairs partial graphs.
    for (const afterCommit of [false, true])
      for (let faultAt = 1; faultAt <= 3; faultAt++) {
        const snapshot = profileFixture();
        trackSnapshot(snapshot);
        let writes = 0;
        const interrupted = createGraphProfileStore({
          execute: async (traversal) => {
            const fail = mutates(traversal.getBytecode()) && ++writes === faultAt;
            if (fail && !afterCommit) throw new Error('physical graph interruption');
            const result = await client.execute(traversal);
            if (fail && afterCommit) throw new Error('physical graph interruption');
            return result;
          },
        });
        await assert.rejects(interrupted.put(snapshot), /physical graph interruption/);
        await graph.put(snapshot);
        assert.deepEqual(await graph.get(snapshot.userId, snapshot.snapshotId), snapshot);
      }
    const corrupt = profileFixture();
    trackSnapshot(corrupt);
    await graph.put(corrupt);
    await client.execute(
      findIdentity(profileRevisionIdentity(corrupt.userId, corrupt.snapshotId))
        .inE('HAS_PROFILE_REVISION')
        .drop()
    );
    await assert.rejects(
      graph.get(corrupt.userId, corrupt.snapshotId),
      /link missing or duplicated/
    );
    await graph.put(corrupt);
    assert.deepEqual(await graph.get(corrupt.userId, corrupt.snapshotId), corrupt);
    await client.execute(
      findIdentity(profileRevisionIdentity(corrupt.userId, corrupt.snapshotId)).property(
        'identityProfileFirstName',
        'corrupted'
      )
    );
    await assert.rejects(graph.get(corrupt.userId, corrupt.snapshotId), /digest mismatch/);
    process.stdout.write(
      'PASS: immutable graph profiles, physical-write recovery, publication CAS/receipts, recoverable BSON account import, preference writes/media allocation, delayed writers, target reads, scope/privacy, schema checksum and corruption refusal\n'
    );
  }
} catch (error) {
  process.stderr.write(
    `Identity graph fixture failed: ${error instanceof Error ? error.message : 'unknown error'}\n`
  );
  throw error;
} finally {
  const results = await Promise.allSettled([
    ...keys.map((key) =>
      admin.execute(
        `DELETE FROM ${config.keyspace}.control_state WHERE scope = ? AND resource_type = ? AND resource_id = ?`,
        [key.scope, key.type, key.id]
      )
    ),
    (async () => {
      // Linked vertices share edge locks; do not delete them in concurrent transactions.
      for (const identity of vertices) {
        await client.execute(findIdentity(identity).hasLabel(identity.kind).drop());
        assert.deepEqual(await client.execute(findIdentity(identity).count()), [0]);
      }
    })(),
  ]);
  await Promise.all([state.close(), admin.close()]);
  if (results.some((result) => result.status === 'rejected'))
    throw new Error(`Identity graph cleanup incomplete; retain ${manifest}`);
  unlinkSync(manifest);
}
