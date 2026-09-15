import { readFileSync } from 'node:fs';

export interface CqlConfig {
  contactPoint: string;
  port: number;
  datacenter: string;
  keyspace: string;
  schemaKeyspace: string;
  username: 'cartyx_state' | 'cartyx_admin';
  password: string;
  ca: Buffer;
  servername: string;
  timeoutMs: number;
}

export function readCqlConfig(
  mode: 'runtime' | 'schema',
  env: NodeJS.ProcessEnv = process.env
): CqlConfig {
  const required = (key: string) => {
    if (!env[key]?.trim()) throw new Error(`Missing ${key}`);
    return env[key]!.trim();
  };
  const contactPoint = required('CQL_CONTACT_POINT');
  const servername = required('CQL_TLS_SERVER_NAME');
  if (![contactPoint, servername].every((v) => /^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(v))) {
    throw new Error('CQL contact point and TLS name must be DNS names or IPv4 addresses');
  }
  const keyspace = required('CQL_STATE_KEYSPACE');
  if (!/^cartyx(?:_dev|_prod)?_state$/.test(keyspace))
    throw new Error('Invalid CQL state keyspace');
  const datacenter = required('CQL_DATACENTER');
  if (!/^[a-z][a-z0-9_]{0,47}$/.test(datacenter)) throw new Error('Invalid CQL datacenter');
  const port = Number(env.CQL_PORT ?? '9042');
  const timeoutMs = Number(env.CQL_TIMEOUT_MS ?? '10000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid CQL_PORT');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 15000)
    throw new Error('Invalid CQL_TIMEOUT_MS');
  const password = readFileSync(
    required(mode === 'schema' ? 'CQL_ADMIN_PASSWORD_FILE' : 'CQL_PASSWORD_FILE'),
    'utf8'
  ).trim();
  const ca = readFileSync(required('CQL_CA_FILE'));
  if (!password || !ca.length) throw new Error('CQL credential and CA files must not be empty');
  return {
    contactPoint,
    port,
    datacenter,
    keyspace,
    schemaKeyspace: keyspace.replace(/_state$/, '_schema'),
    username: mode === 'schema' ? 'cartyx_admin' : 'cartyx_state',
    password,
    ca,
    servername,
    timeoutMs,
  };
}
