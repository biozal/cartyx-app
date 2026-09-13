import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createCqlClient } from '../../app/server/db/cql/client';
import { readCqlConfig } from '../../app/server/db/cql/config';
import {
  createControlStateStore,
  newStateRevision,
  type StateKey,
} from '../../app/server/db/cql/control-state';

import {
  createIdentityReservations,
  identityReservationKey,
  type IdentityReservationIntent,
} from '../../app/server/repositories/identity/reservations';

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
    const userId = randomBytes(12).toString('hex');
    const reservation: IdentityReservationIntent = {
      operationId: randomUUID(),
      userId,
      claims: [
        { kind: 'audio_prefix', value: randomBytes(16).toString('hex') },
        { kind: 'provider_id', value: `fixture_restart_${userId}` },
      ],
    };
    mkdirSync('.local/cql', { recursive: true, mode: 0o700 });
    writeFileSync(path, JSON.stringify({ keyspace: config.keyspace, key, record, reservation }), {
      mode: 0o600,
      flag: 'wx',
    });
    assert.equal(await store.create(key, record.revision, record.value), true);
    assert.deepEqual(await store.get(key), record);
    await createIdentityReservations(store).begin(reservation);
    const interrupted = createIdentityReservations({
      get: (key) => store.get(key),
      replace: (...args) => store.replace(...args),
      create: async (...args) => {
        await store.create(...args);
        throw new Error('restart witness interruption');
      },
    });
    await assert.rejects(
      interrupted.resume(reservation.operationId),
      /restart witness interruption/
    );
    process.stdout.write(
      'Seeded CQL revision and interrupted identity reservation restart witnesses\n'
    );
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
    const cleanupKeys: StateKey[] = [manifest.key];
    if (manifest.reservation) {
      const reservation = manifest.reservation as IdentityReservationIntent;
      const reservations = createIdentityReservations(store);
      // The pre-restart process lost a claim acknowledgement before marking completion.
      // Reopen its journal, verify the claim survived, then complete using saved intent.
      const firstClaim = await store.get(identityReservationKey(reservation.claims[0]));
      assert.deepEqual(firstClaim?.value, {
        version: 1,
        userId: reservation.userId,
        claim: reservation.claims[0],
      });
      assert.equal(await reservations.resume(reservation.operationId), 'reserved');
      cleanupKeys.push(
        { scope: 'global', type: 'identity_reservation_operation', id: reservation.operationId },
        ...reservation.claims.map(identityReservationKey)
      );
      for (const claim of reservation.claims) {
        assert.deepEqual((await store.get(identityReservationKey(claim)))?.value, {
          version: 1,
          userId: reservation.userId,
          claim,
        });
      }
    }
    const admin = createCqlClient(readCqlConfig('schema'));
    try {
      for (const key of cleanupKeys)
        await admin.execute(
          `DELETE FROM ${config.keyspace}.control_state WHERE scope = ? AND resource_type = ? AND resource_id = ?`,
          [key.scope, key.type, key.id]
        );
    } finally {
      await admin.close();
    }
    for (const key of cleanupKeys) assert.equal(await store.get(key), null);
    unlinkSync(path);
    process.stdout.write(
      'Verified CQL revision and identity reservation recovery; removed exact witnesses\n'
    );
  }
} finally {
  await store.close();
}
