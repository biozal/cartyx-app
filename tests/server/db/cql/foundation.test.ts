// @vitest-environment node
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, it, expect } from 'vitest';
import { readCqlConfig } from '../../../../app/server/db/cql/config';
import {
  createControlStateStore,
  encodeState,
  validateStateKey,
} from '../../../../app/server/db/cql/control-state';

const directory = mkdtempSync(join(tmpdir(), 'cartyx-cql-'));
writeFileSync(join(directory, 'runtime'), 'test-runtime');
writeFileSync(join(directory, 'admin'), 'test-admin');
writeFileSync(join(directory, 'ca'), 'test-ca');
afterAll(() => rmSync(directory, { recursive: true }));
const env = {
  CQL_CONTACT_POINT: 'localhost',
  CQL_TLS_SERVER_NAME: 'localhost',
  CQL_DATACENTER: 'dc1',
  CQL_STATE_KEYSPACE: 'cartyx_dev_state',
  CQL_PASSWORD_FILE: join(directory, 'runtime'),
  CQL_ADMIN_PASSWORD_FILE: join(directory, 'admin'),
  CQL_CA_FILE: join(directory, 'ca'),
};

describe('CQL configuration and payload boundary', () => {
  it('separates operator/runtime passwords and derives an admin metadata keyspace', () => {
    expect(readCqlConfig('runtime', env)).toMatchObject({
      username: 'cartyx_state',
      password: 'test-runtime',
      schemaKeyspace: 'cartyx_dev_schema',
    });
    expect(readCqlConfig('schema', env)).toMatchObject({
      username: 'cartyx_admin',
      password: 'test-admin',
    });
    expect(() => createControlStateStore(readCqlConfig('schema', env))).toThrow(
      'runtime credentials'
    );
  });
  it.each([
    { CQL_STATE_KEYSPACE: 'cartyx_dev_graph' },
    { CQL_STATE_KEYSPACE: 'x;drop keyspace y' },
    { CQL_DATACENTER: "dc1';" },
    { CQL_CONTACT_POINT: 'https://localhost' },
    { CQL_TLS_SERVER_NAME: '' },
    { CQL_PORT: '0' },
    { CQL_TIMEOUT_MS: 'NaN' },
  ])('rejects unsafe or missing settings %j', (change) => {
    expect(() => readCqlConfig('runtime', { ...env, ...change })).toThrow();
  });
  it('preserves JSON without silently converting unsupported values', () => {
    const value = { active: true, note: '🦄', nested: [1, null] };
    expect(JSON.parse(encodeState(value))).toEqual({ version: 1, value });
    const cycle: any = {};
    cycle.self = cycle;
    for (const invalid of [
      undefined,
      NaN,
      Infinity,
      -0,
      new Date(),
      { a: undefined },
      [undefined],
      cycle,
      1n,
      { toJSON: () => 'different' },
      'x'.repeat(16385),
    ]) {
      expect(() => encodeState(invalid)).toThrow();
    }
  });
  it('requires explicit scope and bounded partition identifiers', () => {
    expect(validateStateKey({ scope: 'global', type: 'probe', id: 'one' })).toEqual([
      'global',
      'probe',
      'one',
    ]);
    expect(() => validateStateKey({ scope: 'campaign:any', type: 'probe', id: 'one' })).toThrow();
    expect(() =>
      validateStateKey({ scope: 'global', type: 'probe', id: 'x'.repeat(129) })
    ).toThrow();
  });
});
