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

import {
  createIdentityAccountState,
  identityAccountKey,
  identityAccountOperationKey,
  type AccountCommand,
} from '../../app/server/repositories/identity/account-state';

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
    const account: AccountCommand = {
      kind: 'initialize',
      operationId: randomUUID(),
      userId,
      email: null,
      audioStoragePrefix: null,
    };
    mkdirSync('.local/cql', { recursive: true, mode: 0o700 });
    writeFileSync(
      path,
      JSON.stringify({ keyspace: config.keyspace, key, record, reservation, account }),
      {
        mode: 0o600,
        flag: 'wx',
      }
    );
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
    await createIdentityAccountState(store).begin(account);
    const interruptedAccount = createIdentityAccountState({
      get: (key) => store.get(key),
      replace: (...args) => store.replace(...args),
      create: async (...args) => {
        await store.create(...args);
        throw new Error('account restart witness interruption');
      },
    });
    await assert.rejects(
      interruptedAccount.resume(account.operationId),
      /account restart witness interruption/
    );
    await assert.rejects(
      createIdentityAccountState(store).readAccount(account.userId),
      /requires operation recovery/
    );
    process.stdout.write(
      'Seeded CQL revision, interrupted reservation and unreceipted account restart witnesses\n'
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
    if (manifest.account) {
      const account = manifest.account as AccountCommand;
      const accounts = createIdentityAccountState(store);
      assert.equal(
        (await store.get(identityAccountKey(account.userId)))?.revision,
        account.operationId
      );
      const receipt = await store.get(identityAccountOperationKey(account.operationId));
      const status = (receipt?.value as { status?: string } | undefined)?.status;
      if (status === 'prepared')
        await assert.rejects(accounts.readAccount(account.userId), /requires operation recovery/);
      else assert.equal(status, 'applied'); // A previous verify may have resumed before losing its reply.
      assert.equal(await accounts.resume(account.operationId), 'applied');
      assert.equal((await accounts.readAccount(account.userId))?.revision, account.operationId);
      cleanupKeys.push(
        identityAccountKey(account.userId),
        identityAccountOperationKey(account.operationId)
      );
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
      'Verified CQL revision, reservation and account receipt recovery; removed exact witnesses\n'
    );
  }
} finally {
  await store.close();
}
