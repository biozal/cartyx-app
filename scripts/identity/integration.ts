// Synthetic fixtures only. Creates its own loopback Docker MongoDB; never reads
// MONGODB_URI or accepts a caller-supplied server/database for fixture writes.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { exportIdentity, verifyArchive } from './archive';
import { testMongoIdentityRepository } from './mongo-repository-test';

const { BSON, MongoClient } = mongoose.mongo;
const images = {
  '7': 'mongo@sha256:b096b4cb9269f3ebcf363be63f1c50920f786879d03a1890347a3bf33f1f0df0',
  '8': 'mongo@sha256:81a1c8842a09589fc8d5f285266f3340bf4abdf66700ba22988f14cc9b2b3118',
};
const version = process.env.IDENTITY_TEST_MONGO_VERSION ?? '7';
assert.ok(version === '7' || version === '8', 'Fixture version must be 7 or 8');
const name = `cartyx-identity-test-${randomUUID()}`;
const root = await mkdtemp(join(tmpdir(), 'cartyx-identity-test-'));
const password = randomUUID();
const adminPassword = randomUUID();
const docker = (...args: string[]) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 120_000,
  }).trim();
let stage = 'container startup';
let client: InstanceType<typeof MongoClient> | undefined;
try {
  docker(
    'run',
    '-d',
    '--name',
    name,
    '-p',
    '127.0.0.1::27017',
    images[version],
    'bash',
    '-c',
    'umask 077; head -c 756 /dev/urandom | base64 > /tmp/identity-key; exec mongod --replSet identity-test --bind_ip_all --keyFile /tmp/identity-key'
  );
  const port = docker('port', name, '27017/tcp').split(':').at(-1);
  const uri = `mongodb://127.0.0.1:${port}/identity_fixture?directConnection=true`;
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 30_000 });
  stage = 'initial connection';
  await client.connect();
  stage = 'replica set initiation';
  execFileSync('docker', ['exec', '-i', name, 'mongosh', '--quiet'], {
    input: 'rs.initiate({_id: "identity-test", members: [{_id: 0, host: "localhost:27017"}]});\n',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30_000,
  });
  stage = 'primary election';
  const deadline = Date.now() + 60_000;
  while (!(await client.db('admin').command({ hello: 1 })).isWritablePrimary) {
    assert.ok(Date.now() < deadline, 'Replica set startup deadline');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  stage = 'administrator creation';
  execFileSync('docker', ['exec', '-i', name, 'mongosh', '--quiet'], {
    input: `db.getSiblingDB('admin').createUser({user: 'fixture_admin', pwd: ${JSON.stringify(adminPassword)}, roles: ['root']});\n`,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30_000,
  });
  await client.close();
  const adminUri = `mongodb://fixture_admin:${adminPassword}@127.0.0.1:${port}/identity_fixture?directConnection=true&authSource=admin`;
  client = new MongoClient(adminUri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  stage = 'fixture creation';
  const db = client.db();
  const userId = new BSON.ObjectId();
  const campaignId = new BSON.ObjectId();
  const user = {
    _id: userId,
    role: 'gm',
    providerId: 'fixture-identity',
    email: 'fixture@example.invalid',
    campaigns: [
      {
        _id: new BSON.ObjectId(),
        campaignId,
        joinedAt: new Date('2020-01-02T03:04:05Z'),
        status: 'active',
      },
    ],
    oauthTokens: {
      accessToken: { ciphertext: 'opaque-ciphertext', iv: 'opaque-iv', authTag: 'opaque-tag' },
      refreshToken: null,
    },
    audioStoragePrefix: 'ab'.repeat(16),
    firstName: '雪 🐉',
    legacy: {
      integer: new BSON.Int32(42),
      long: BSON.Long.fromString('9223372036854775807'),
      decimal: BSON.Decimal128.fromString('123.4500'),
      binary: new BSON.Binary(Buffer.from([0, 255, 127]), 0),
      uuid: new BSON.UUID(),
      double: new BSON.Double(-0),
      timestamp: new BSON.Timestamp({ t: 12, i: 3 }),
      regex: new BSON.BSONRegExp('npc.*', 'i'),
      null: null,
      array: [null, { nested: true }],
    },
  };
  await db
    .collection('users')
    .insertMany(
      [user, ...Array.from({ length: 205 }, () => ({ _id: new BSON.ObjectId(), role: 'unknown' }))],
      { writeConcern: { w: 'majority' } }
    );
  await db.collection('campaigns').insertOne(
    {
      _id: campaignId,
      gameMasterId: userId,
      members: [{ userId, role: 'gm' }],
      marker: 'before',
    },
    { writeConcern: { w: 'majority' } }
  );
  await db.collection('users').createIndex({ providerId: 1 }, { unique: true, sparse: true });
  await db.command({
    createUser: 'identity_reader',
    pwd: password,
    roles: [{ role: 'read', db: db.databaseName }],
  });
  const readUri = `mongodb://identity_reader:${password}@127.0.0.1:${port}/identity_fixture?directConnection=true`;
  stage = 'read-only role enforcement';
  const reader = new MongoClient(readUri);
  try {
    await assert.rejects(
      reader.db().collection('users').insertOne({}),
      (error: unknown) => error instanceof mongoose.mongo.MongoServerError && error.code === 13
    );
  } finally {
    await reader.close();
  }
  const expected = [];
  for await (const raw of client.db().collection('users').find({}, { raw: true })) {
    assert.ok(Buffer.isBuffer(raw));
    expected.push(Buffer.from(raw));
  }
  stage = 'snapshot export';
  const { directory, report } = await exportIdentity({ uri: readUri, source: 'local', root });
  assert.deepEqual(report.counts, { users: 206, campaigns: 1 });
  assert.deepEqual(report.findings, {});
  assert.deepEqual(await readFile(join(directory, 'users.bson')), Buffer.concat(expected));
  assert.deepEqual(await verifyArchive(directory), report);
  // Driver snapshot contract: two collections still see the same timestamp
  // after a majority-committed mutation between reads.
  stage = 'snapshot concurrent-write contract';
  const session = client.startSession({ snapshot: true, causalConsistency: false });
  try {
    await client.db().collection('users').findOne({ _id: userId }, { session });
    await client
      .db()
      .collection('campaigns')
      .updateOne(
        { _id: campaignId },
        { $set: { marker: 'after' } },
        { writeConcern: { w: 'majority' } }
      );
    assert.equal(
      (await client.db().collection('campaigns').findOne({ _id: campaignId }, { session }))?.marker,
      'before'
    );
    assert.equal(
      (await client.db().collection('campaigns').findOne({ _id: campaignId }))?.marker,
      'after'
    );
  } finally {
    await session.endSession();
  }
  // Missing source collection must leave no completion marker.
  await assert.rejects(
    exportIdentity({ uri: adminUri, database: 'missing_fixture', source: 'local', root })
  );
  const runs = await readdir(join(root, '.local/data/identity'));
  for (const run of runs)
    if (join(root, '.local/data/identity', run) !== directory) {
      assert.ok(
        !(await readdir(join(root, '.local/data/identity', run))).includes('manifest.json')
      );
    }
  stage = 'identity repository contract';
  await testMongoIdentityRepository(adminUri);
  stage = 'empty collections';
  await client.db('empty_fixture').createCollection('users');
  await client.db('empty_fixture').createCollection('campaigns');
  const empty = await exportIdentity({
    uri: adminUri,
    database: 'empty_fixture',
    source: 'local',
    root,
  });
  assert.deepEqual(empty.report.counts, { users: 0, campaigns: 0 });
  stage = 'standalone snapshot refusal';
  await client.close();
  client = undefined;
  docker('rm', '-fv', name);
  docker('run', '-d', '--name', name, '-p', '127.0.0.1::27017', images[version]);
  const standalonePort = docker('port', name, '27017/tcp').split(':').at(-1);
  const standaloneUri = `mongodb://127.0.0.1:${standalonePort}/standalone_fixture?directConnection=true`;
  client = new MongoClient(standaloneUri, { serverSelectionTimeoutMS: 30_000 });
  await client.connect();
  await client.db().createCollection('users');
  await client.db().createCollection('campaigns');
  const beforeStandalone = new Set(await readdir(join(root, '.local/data/identity')));
  await assert.rejects(exportIdentity({ uri: standaloneUri, source: 'local', root }));
  const failedRun = (await readdir(join(root, '.local/data/identity'))).filter(
    (run) => !beforeStandalone.has(run)
  );
  assert.equal(failedRun.length, 1);
  assert.ok(
    !(await readdir(join(root, '.local/data/identity', failedRun[0]))).includes('manifest.json')
  );
  console.log(
    'Identity archive and repository integration passed: availability and disconnected-operation refusal, login/claim/concurrency, profile privacy, preferences, membership revocation, read-only authorization, raw BSON, hidden fields, multiple cursor batches, snapshot consistency, private verification, empty collections, incomplete-export and standalone-snapshot rejection.'
  );
} catch (error) {
  console.error(
    `Identity archive integration failed at ${stage} (${error instanceof mongoose.mongo.MongoServerError ? error.code : 'check'}).`
  );
  process.exitCode = 1;
} finally {
  await client?.close();
  docker('rm', '-fv', name);
  await rm(root, { recursive: true, force: true });
}
