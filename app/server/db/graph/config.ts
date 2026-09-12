import { readFileSync } from 'node:fs';

export interface GraphConnectionConfig {
  url: string;
  username: string;
  password: string;
  ca: Buffer;
  timeoutMs: number;
}

/** Server/operator settings only. No defaults that could select another environment. */
export function readGraphConfig(env: NodeJS.ProcessEnv = process.env): GraphConnectionConfig {
  const required = (name: string) => {
    const value = env[name];
    if (!value?.trim()) throw new Error(`Missing ${name}`);
    return value;
  };
  const url = new URL(required('GREMLIN_URL'));
  if (url.protocol !== 'wss:' || url.username || url.password || url.search || url.hash) {
    throw new Error('GREMLIN_URL must use wss without credentials, query, or fragment');
  }
  if (url.pathname !== '/gremlin') throw new Error('GREMLIN_URL must end in /gremlin');
  const timeoutMs = Number(env.GREMLIN_TIMEOUT_MS ?? '10000');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 15000) {
    throw new Error('GREMLIN_TIMEOUT_MS must be an integer from 100 to 15000');
  }
  const password = readFileSync(required('GREMLIN_PASSWORD_FILE'), 'utf8').trim();
  const ca = readFileSync(required('GREMLIN_CA_FILE'));
  if (!password || !ca.length) throw new Error('Gremlin credential and CA files must not be empty');
  return { url: url.toString(), username: required('GREMLIN_USERNAME'), password, ca, timeoutMs };
}
