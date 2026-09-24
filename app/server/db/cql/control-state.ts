import { randomUUID } from 'node:crypto';
import cassandra from 'cassandra-driver';
import { createCqlClient } from './client';
import type { CqlConfig } from './config';

export interface StateKey {
  scope: string;
  type: string;
  id: string;
}
export interface StateRecord {
  revision: string;
  value: unknown;
}
export const newStateRevision = () => randomUUID();
export function validateStateKey(key: StateKey): string[] {
  if (!/^(global|(?:campaign|user):[0-9a-f]{24})$/.test(key.scope))
    throw new Error('Invalid state scope');
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(key.type)) throw new Error('Invalid state type');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/.test(key.id)) throw new Error('Invalid state ID');
  return [key.scope, key.type, key.id];
}
function revision(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value))
    throw new Error('Expected a fresh UUID v4 revision');
  return cassandra.types.Uuid.fromString(value);
}
export function encodeState(value: unknown): string {
  // JSON is a bounded operational payload, not graph relationships. Domain callers
  // must validate their own value schema before passing a JSON value here.
  const ancestors = new WeakSet<object>();
  let nodes = 0;
  const validate = (item: unknown, depth: number): void => {
    if (++nodes > 4096 || depth > 32) throw new Error('State payload exceeds structural limits');
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'string' && item.length <= 16384) return;
    if (typeof item === 'number' && Number.isFinite(item) && !Object.is(item, -0)) return;
    if (typeof item !== 'object' || item === null || ancestors.has(item))
      throw new Error('State payload must be lossless JSON');
    if (!Array.isArray(item) && ![Object.prototype, null].includes(Object.getPrototypeOf(item)))
      throw new Error('State payload must contain plain JSON objects');
    ancestors.add(item);
    if (Array.isArray(item)) {
      if (
        Object.getPrototypeOf(item) !== Array.prototype ||
        Reflect.ownKeys(item).length !== item.length + 1
      )
        throw new Error('State arrays must not have custom properties or holes');
      for (let i = 0; i < item.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(i));
        if (!descriptor || descriptor.get || descriptor.set || !descriptor.enumerable)
          throw new Error('State arrays must contain plain JSON elements');
        validate(descriptor.value, depth + 1);
      }
    } else {
      if (Object.getOwnPropertySymbols(item).length)
        throw new Error('State payload must be lossless JSON');
      for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(item))) {
        if (descriptor.get || descriptor.set || !descriptor.enumerable)
          throw new Error('State payload must contain plain JSON properties');
        validate(descriptor.value, depth + 1);
      }
    }
    ancestors.delete(item);
  };
  validate(value, 0);
  const encoded = JSON.stringify({ version: 1, value });
  if (value === undefined || Buffer.byteLength(encoded, 'utf8') > 16384)
    throw new Error('State payload must be JSON up to 16 KiB');
  const parsed = JSON.parse(encoded);
  if (!Object.hasOwn(parsed, 'value')) throw new Error('State value must be JSON');
  return encoded;
}

/** Single-row conditional state, not a cross-record transaction or authorization layer. */
export function createControlStateStore(config: CqlConfig) {
  if (config.username !== 'cartyx_state')
    throw new Error('Control state requires runtime credentials');
  const client = createCqlClient(config);
  const table = `${config.keyspace}.control_state`;
  const where = 'scope = ? AND resource_type = ? AND resource_id = ?';
  return {
    async get(key: StateKey): Promise<StateRecord | null> {
      const result = await client.execute(
        `SELECT revision, payload FROM ${table} WHERE ${where}`,
        validateStateKey(key),
        { serialRead: true }
      );
      const row = result.first();
      if (!row) return null;
      if (typeof row.payload !== 'string' || Buffer.byteLength(row.payload, 'utf8') > 16384)
        throw new Error('Invalid stored state payload');
      const parsed = JSON.parse(row.payload);
      if (parsed.version !== 1 || !Object.hasOwn(parsed, 'value'))
        throw new Error('Unsupported stored state format');
      return { revision: row.revision.toString(), value: parsed.value };
    },
    async create(key: StateKey, nextRevision: string, value: unknown): Promise<boolean> {
      const result = await client.execute(
        `INSERT INTO ${table} (scope, resource_type, resource_id, revision, payload) VALUES (?, ?, ?, ?, ?) IF NOT EXISTS`,
        [...validateStateKey(key), revision(nextRevision), encodeState(value)]
      );
      return result.wasApplied();
    },
    async replace(
      key: StateKey,
      expectedRevision: string,
      nextRevision: string,
      value: unknown
    ): Promise<boolean> {
      if (expectedRevision === nextRevision)
        throw new Error('Every mutation requires a fresh revision');
      const result = await client.execute(
        `UPDATE ${table} SET revision = ?, payload = ? WHERE ${where} IF revision = ?`,
        [
          revision(nextRevision),
          encodeState(value),
          ...validateStateKey(key),
          revision(expectedRevision),
        ]
      );
      return result.wasApplied();
    },
    close: client.close,
  };
}
