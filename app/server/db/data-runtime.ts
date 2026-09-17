import { readCqlConfig } from './cql/config';
import { createCqlClient } from './cql/client';
import { createControlStateStore } from './cql/control-state';
import { readGraphConfig } from './graph/config';
import { createGraphClient } from './graph/client';
import { findIdentity, graphIdentity } from './graph/identity';
import { submitGraphRequest } from './graph/transport';

/** Request paths refuse rather than queue when a store is unavailable. */
export class DataUnavailableError extends Error {
  readonly status = 503;
  constructor() {
    super('Database not connected');
    this.name = 'DataUnavailableError';
  }
}

const PROBE_TIMEOUT_MS = 2_000;

/**
 * Process-wide runtime data access. Repositories take a client; only composition
 * roots and probes call these. The runtime never holds operator credentials: schema
 * migration and fixture cleanup run from operator tooling with their own settings.
 */
function readRuntimeGraphConfig() {
  const config = readGraphConfig();
  if (config.username === 'cartyx_admin')
    throw new Error('Runtime graph access must not use the operator credential');
  return config;
}

function readRuntimeCqlConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.CQL_ADMIN_PASSWORD_FILE)
    throw new Error('Runtime CQL access must not receive the operator credential file');
  return readCqlConfig('runtime', env);
}

let graphClient: ReturnType<typeof createGraphClient> | undefined;
let cqlClient: ReturnType<typeof createCqlClient> | undefined;
let stateStore: ReturnType<typeof createControlStateStore> | undefined;

export function getGraphClient() {
  graphClient ??= createGraphClient(readRuntimeGraphConfig());
  return graphClient;
}

function getCqlClient() {
  cqlClient ??= createCqlClient(readRuntimeCqlConfig());
  return cqlClient;
}

export function getStateStore() {
  stateStore ??= createControlStateStore(readRuntimeCqlConfig());
  return stateStore;
}

// Fail the configuration at import time so a misconfigured deployment cannot start
// serving requests and only discover its credentials on the first user action.
readRuntimeGraphConfig();
readRuntimeCqlConfig();

const bounded = async (probe: () => Promise<unknown>) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('probe timeout')), PROBE_TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Observes both stores without throwing. Readiness is a health signal, not a lease:
 * a store can fail immediately after a successful probe.
 */
export async function checkDataReadiness(): Promise<{ graph: boolean; cql: boolean }> {
  const [graph, cql] = await Promise.all([
    // A miss on the composite identity index: it exercises the index, the configured
    // serializer and the server policy without reading application data. The schema
    // registry is deliberately not probed; the runtime principal cannot read it.
    bounded(() =>
      submitGraphRequest(
        readRuntimeGraphConfig(),
        findIdentity(graphIdentity('ReadinessProbe', '0'.repeat(24), { type: 'global' }))
          .limit(1)
          .count()
          .getBytecode()
      )
    ),
    bounded(() => getCqlClient().execute('SELECT release_version FROM system.local')),
  ]);
  return { graph, cql };
}

export async function requireDataAvailable(): Promise<void> {
  const readiness = await checkDataReadiness();
  if (!readiness.graph || !readiness.cql) throw new DataUnavailableError();
}
