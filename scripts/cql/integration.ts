import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync, renameSync } from 'node:fs';
import { readCqlConfig } from '../../app/server/db/cql/config';
import { createCqlClient } from '../../app/server/db/cql/client';
import {
  createControlStateStore,
  newStateRevision,
  type StateKey,
} from '../../app/server/db/cql/control-state';
import { runCqlSchema, cqlSchemaManifest } from './schema';
import cassandra from 'cassandra-driver';
import { identityReservationContract } from '../identity/reservation-contract';

const runtime = readCqlConfig('runtime');
const adminConfig = readCqlConfig('schema');
await runCqlSchema(adminConfig, 'verify');
await runCqlSchema(adminConfig, 'apply', randomUUID());
const admin = createCqlClient(adminConfig);
const rawRuntime = createCqlClient(runtime);
const store = createControlStateStore(runtime);
const token = randomBytes(12).toString('hex');
const key: StateKey = { scope: `campaign:${token}`, type: 'foundation_probe', id: token };
const other: StateKey = { ...key, scope: `user:${token}` };
const differentType: StateKey = { ...key, type: 'other_probe' };
const scratch = {
  ...adminConfig,
  keyspace: `cartyx_probe_${token}_state`,
  schemaKeyspace: `cartyx_probe_${token}_schema`,
};
const deniedTable = `denied_probe_${token}`;
mkdirSync('.local/cql/runs', { recursive: true, mode: 0o700 });
const manifest = `.local/cql/runs/${token}.json`;
const probeKeys = [key, other, differentType];
const writeManifest = () => {
  writeFileSync(
    `${manifest}.tmp`,
    JSON.stringify(
      {
        keyspace: runtime.keyspace,
        keys: probeKeys,
        deniedTable,
        scratchKeyspaces: [scratch.keyspace, scratch.schemaKeyspace],
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  renameSync(`${manifest}.tmp`, manifest);
};
writeManifest();
const track = (item: StateKey) => {
  if (!probeKeys.some((key) => JSON.stringify(key) === JSON.stringify(item))) {
    probeKeys.push(item);
    writeManifest(); // Persist each exact fixture key before a possible write.
  }
};
try {
  // Rehearse an interrupted installer in uniquely named, empty keyspaces.
  for (const keyspace of [scratch.keyspace, scratch.schemaKeyspace]) {
    await admin.execute(
      `CREATE KEYSPACE ${keyspace} WITH replication = {'class': 'NetworkTopologyStrategy', '${adminConfig.datacenter}': 1} AND durable_writes = true`,
      [],
      { ddl: true }
    );
  }
  const journal = `${scratch.schemaKeyspace}.schema_migrations`;
  await admin.execute(`CREATE TABLE ${journal} (${cqlSchemaManifest.journalDefinition})`, [], {
    ddl: true,
  });
  const owner = randomUUID();
  await admin.execute(
    `INSERT INTO ${journal} (name, version, checksum, status, owner) VALUES (?, ?, ?, ?, ?) IF NOT EXISTS`,
    [
      'cartyx',
      cqlSchemaManifest.version,
      cqlSchemaManifest.checksum,
      'installing',
      cassandra.types.Uuid.fromString(owner),
    ]
  );
  await assert.rejects(runCqlSchema(scratch, 'verify'), /Migration unfinished/);
  await assert.rejects(runCqlSchema(scratch, 'apply', randomUUID()), /Migration unfinished/);
  await runCqlSchema(scratch, 'apply', owner);
  await runCqlSchema(scratch, 'verify');
  await admin.execute(`UPDATE ${journal} SET checksum = ? WHERE name = ?`, [
    'incorrect-checksum',
    'cartyx',
  ]);
  await assert.rejects(runCqlSchema(scratch, 'apply', owner), /version\/checksum mismatch/);
  await admin.execute(`UPDATE ${journal} SET checksum = ? WHERE name = ?`, [
    cqlSchemaManifest.checksum,
    'cartyx',
  ]);
  await admin.execute(`ALTER TABLE ${scratch.keyspace}.control_state ADD unexpected text`, [], {
    ddl: true,
  });
  await assert.rejects(runCqlSchema(scratch, 'verify'), /schema drift/);
  const first = newStateRevision();
  const payload = { version: 1, note: "bound'); DROP TABLE control_state; -- 🐉", count: 1 };
  assert.equal(await store.create(key, first, payload), true);
  assert.equal(await store.create(key, first, payload), false, 'Replay must not insert twice');
  assert.deepEqual(
    await store.get(key),
    { revision: first, value: payload },
    'Caller can reconcile an ignored/lost acknowledgement by its known revision'
  );
  assert.equal(await store.get(other), null);
  assert.equal(await store.get(differentType), null);
  assert.equal(await store.create(other, newStateRevision(), { other: true }), true);
  const attempts = Array.from({ length: 4 }, (_, winner) => ({
    revision: newStateRevision(),
    value: { winner },
  }));
  const outcomes = await Promise.all(
    attempts.map((attempt) => store.replace(key, first, attempt.revision, attempt.value))
  );
  assert.equal(outcomes.filter(Boolean).length, 1, 'Exactly one compare-and-set may win');
  const winner = attempts[outcomes.indexOf(true)];
  assert.deepEqual(await store.get(key), winner);
  assert.equal(await store.replace(key, first, newStateRevision(), { stale: true }), false);
  const third = newStateRevision();
  assert.equal(await store.replace(key, winner.revision, third, payload), true);
  assert.equal(
    await store.replace(key, first, newStateRevision(), { stale: true }),
    false,
    'Returning to an old value must not revive an old revision'
  );
  assert.deepEqual(await store.get(key), { revision: third, value: payload });
  await assert.rejects(
    rawRuntime.execute(
      `CREATE TABLE ${runtime.keyspace}.${deniedTable} (id text PRIMARY KEY)`,
      [],
      { ddl: true }
    ),
    /CQL request failed/
  );
  await assert.rejects(
    rawRuntime.execute(
      `SELECT name FROM ${runtime.schemaKeyspace}.schema_migrations WHERE name = ?`,
      ['cartyx']
    ),
    /CQL request failed/
  );
  await assert.rejects(
    rawRuntime.execute(
      `INSERT INTO ${runtime.schemaKeyspace}.schema_migrations (name, status) VALUES (?, ?)`,
      [`probe-${token}`, 'forbidden']
    ),
    /CQL request failed/
  );
  // Confirm the table exists as admin before proving runtime denial.
  await admin.execute(
    `SELECT key FROM ${runtime.keyspace.replace(/_state$/, '_graph')}.edgestore LIMIT 1`
  );
  await assert.rejects(
    rawRuntime.execute(
      `SELECT key FROM ${runtime.keyspace.replace(/_state$/, '_graph')}.edgestore LIMIT 1`
    ),
    /CQL request failed/
  );
  for (const overrides of [
    { password: randomUUID() },
    { ca: Buffer.from('untrusted') },
    { servername: 'invalid.cartyx.test' },
  ]) {
    const bad = createCqlClient({ ...runtime, ...overrides });
    try {
      await assert.rejects(
        bad.execute(
          `SELECT revision FROM ${runtime.keyspace}.control_state WHERE scope = ? AND resource_type = ? AND resource_id = ?`,
          [key.scope, key.type, key.id]
        ),
        /CQL request failed/
      );
    } finally {
      await bad.close();
    }
  }
  assert.deepEqual(await store.get(key), { revision: third, value: payload });
  await identityReservationContract({
    get: (key) => store.get(key),
    create: (key, revision, value) => {
      track(key);
      return store.create(key, revision, value);
    },
    replace: (key, expected, revision, value) => {
      track(key);
      return store.replace(key, expected, revision, value);
    },
  });
  process.stdout.write(
    'PASS: CQL schema repeat/recovery/drift, scoped records, conditional create/update, replay reconciliation, stale-write rejection, runtime permissions, TLS/authentication, identity reservation concurrency/interruption/conflicts\n'
  );
} finally {
  const cleanup = await Promise.allSettled([
    ...[scratch.keyspace, scratch.schemaKeyspace].map((keyspace) =>
      admin.execute(`DROP KEYSPACE IF EXISTS ${keyspace}`, [], { ddl: true })
    ),
    ...probeKeys.map((item) =>
      admin.execute(
        `DELETE FROM ${runtime.keyspace}.control_state WHERE scope = ? AND resource_type = ? AND resource_id = ?`,
        [item.scope, item.type, item.id]
      )
    ),
    admin.execute(`DELETE FROM ${runtime.schemaKeyspace}.schema_migrations WHERE name = ?`, [
      `probe-${token}`,
    ]),
    admin.execute(`DROP TABLE IF EXISTS ${runtime.keyspace}.${deniedTable}`, [], { ddl: true }),
  ]);
  await Promise.all([store.close(), rawRuntime.close(), admin.close()]);
  if (cleanup.some((r) => r.status === 'rejected'))
    throw new Error(`CQL probe cleanup incomplete; exact records retained in ${manifest}`);
  unlinkSync(manifest);
}
