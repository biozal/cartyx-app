import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createCqlClient } from '../../app/server/db/cql/client';
import { readCqlConfig } from '../../app/server/db/cql/config';
import {
  createControlStateStore,
  newStateRevision,
  type StateKey,
} from '../../app/server/db/cql/control-state';

const mode = process.argv[2];
if (!['seed-persistence', 'verify-persistence'].includes(mode))
  throw new Error('Invalid persistence mode');
const config = readCqlConfig('runtime');
const store = createControlStateStore(config);
const path = '.local/cql/persistence.json';
try {
  if (mode === 'seed-persistence') {
    if (existsSync(path))
      throw new Error(
        'Persistence manifest already exists; verify or recover its exact record first'
      );
    const key: StateKey = {
      scope: 'global',
      type: 'foundation_probe',
      id: randomBytes(12).toString('hex'),
    };
    const record = {
      revision: newStateRevision(),
      value: { survives: 'Cassandra and JanusGraph restart' },
    };
    mkdirSync('.local/cql', { recursive: true, mode: 0o700 });
    writeFileSync(path, JSON.stringify({ keyspace: config.keyspace, key, record }), {
      mode: 0o600,
      flag: 'wx',
    });
    assert.equal(await store.create(key, record.revision, record.value), true);
    assert.deepEqual(await store.get(key), record);
    process.stdout.write('Seeded CQL restart witness\n');
  } else {
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(
      manifest.keyspace,
      config.keyspace,
      'Persistence witness belongs to a different keyspace'
    );
    assert.equal(manifest.key.scope, 'global');
    assert.equal(manifest.key.type, 'foundation_probe');
    assert.deepEqual(await store.get(manifest.key), manifest.record);
    const admin = createCqlClient(readCqlConfig('schema'));
    try {
      await admin.execute(
        `DELETE FROM ${config.keyspace}.control_state WHERE scope = ? AND resource_type = ? AND resource_id = ?`,
        [manifest.key.scope, manifest.key.type, manifest.key.id]
      );
    } finally {
      await admin.close();
    }
    assert.equal(await store.get(manifest.key), null);
    unlinkSync(path);
    process.stdout.write('Verified persisted CQL revision/payload and removed its exact witness\n');
  }
} finally {
  await store.close();
}
