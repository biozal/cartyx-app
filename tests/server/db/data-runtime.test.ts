// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const secrets = mkdtempSync(join(tmpdir(), 'cartyx-data-runtime-'));
const secret = (name: string, value: string) => {
  const path = join(secrets, name);
  writeFileSync(path, value, { mode: 0o600 });
  return path;
};
const password = secret('password', 'a'.repeat(64));
const ca = secret('ca.crt', '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----\n');

const submitGraphRequest = vi.fn();
const cqlExecute = vi.fn();
const cqlClose = vi.fn(async () => {});
const createCqlClient = vi.fn(() => ({ execute: cqlExecute, close: cqlClose }));

vi.mock('~/server/db/graph/transport', () => ({
  submitGraphRequest,
  GraphRequestError: class GraphRequestError extends Error {},
}));
vi.mock('~/server/db/cql/client', () => ({ createCqlClient }));

const environment = {
  GREMLIN_URL: 'wss://localhost:18182/gremlin',
  GREMLIN_USERNAME: 'cartyx_identity',
  GREMLIN_PASSWORD_FILE: password,
  GREMLIN_CA_FILE: ca,
  CQL_CONTACT_POINT: '127.0.0.1',
  CQL_TLS_SERVER_NAME: 'localhost',
  CQL_DATACENTER: 'dc1',
  CQL_STATE_KEYSPACE: 'cartyx_state',
  CQL_PASSWORD_FILE: password,
  CQL_CA_FILE: ca,
};

async function load(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();
  // Optional keys must be cleared between cases, not inherited from an earlier one.
  for (const [key, value] of Object.entries({
    CQL_ADMIN_PASSWORD_FILE: undefined,
    ...environment,
    ...overrides,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import('~/server/db/data-runtime');
}

beforeEach(() => {
  vi.clearAllMocks();
  submitGraphRequest.mockResolvedValue([1]);
  cqlExecute.mockResolvedValue({ rows: [{ release_version: '4.0.21' }] });
});

describe('data runtime', () => {
  it('reports each store independently and never throws', async () => {
    const { checkDataReadiness } = await load();
    cqlExecute.mockRejectedValueOnce(new Error('cassandra down'));
    await expect(checkDataReadiness()).resolves.toEqual({ graph: true, cql: false });
    submitGraphRequest.mockRejectedValueOnce(new Error('gremlin down'));
    await expect(checkDataReadiness()).resolves.toEqual({ graph: false, cql: true });
  });

  it('reuses one client per process instead of connecting per request', async () => {
    const { getGraphClient, getStateStore } = await load();
    expect(getGraphClient()).toBe(getGraphClient());
    expect(getStateStore()).toBe(getStateStore());
    expect(createCqlClient).toHaveBeenCalledTimes(1);
  });

  it('probes the graph with an indexed read and Cassandra with a local query', async () => {
    const { checkDataReadiness } = await load();
    await checkDataReadiness();
    expect(submitGraphRequest).toHaveBeenCalledTimes(1);
    const [, bytecode] = submitGraphRequest.mock.calls[0];
    expect(JSON.stringify(bytecode)).toContain('ReadinessProbe');
    expect(JSON.stringify(bytecode)).not.toContain('graphSchema');
    expect(cqlExecute.mock.calls[0][0]).toMatch(/system\.local/);
  });

  it('refuses a runtime configuration that carries operator credentials', async () => {
    await expect(load({ GREMLIN_USERNAME: 'cartyx_admin' })).rejects.toThrow(
      /operator credential/i
    );
    await expect(load({ CQL_ADMIN_PASSWORD_FILE: password })).rejects.toThrow(
      /operator credential/i
    );
  });

  it('surfaces an unavailable store as a 503-compatible error', async () => {
    const { DataUnavailableError, requireDataAvailable } = await load();
    cqlExecute.mockRejectedValue(new Error('cassandra down'));
    await expect(requireDataAvailable()).rejects.toBeInstanceOf(DataUnavailableError);
    await expect(requireDataAvailable()).rejects.toMatchObject({ status: 503 });
    cqlExecute.mockResolvedValue({ rows: [] });
    await expect(requireDataAvailable()).resolves.toBeUndefined();
  });

  it('releases its pools on close, and rebuilds what was composed on them', async () => {
    const { closeData, getStateStore, onDataClose } = await load();
    const first = getStateStore();
    const forget = vi.fn();
    onDataClose(forget);

    await closeData();
    // A script must be able to exit, so the pool is actually shut down.
    expect(cqlClose).toHaveBeenCalled();
    // Anything built on the old store is told to drop it; a later call must not reach
    // a pool that has been shut down.
    expect(forget).toHaveBeenCalledOnce();
    expect(getStateStore()).not.toBe(first);
  });
});
