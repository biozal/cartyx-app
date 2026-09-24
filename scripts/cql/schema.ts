import { createHash } from 'node:crypto';
import cassandra from 'cassandra-driver';
import { createCqlClient, type CqlClient } from '../../app/server/db/cql/client';
import type { CqlConfig } from '../../app/server/db/cql/config';

// Released definitions are immutable; future changes require an explicit migration.
const stateDefinition =
  'scope text, resource_type text, resource_id text, revision uuid, payload text, PRIMARY KEY ((scope, resource_type, resource_id))';
const journalDefinition =
  'name text PRIMARY KEY, version text, checksum text, status text, owner uuid';
const checksum = createHash('sha256')
  .update(JSON.stringify({ version: '0001', stateDefinition, journalDefinition }))
  .digest('hex');
export const cqlSchemaManifest = { version: '0001', checksum, journalDefinition, stateDefinition };
const lwtRead = { serialRead: true };

async function verifyTable(
  client: CqlClient,
  keyspace: string,
  table: string,
  expected: Record<string, [string, string, number]>
) {
  const result = await client.execute(
    'SELECT column_name, type, kind, position FROM system_schema.columns WHERE keyspace_name = ? AND table_name = ?',
    [keyspace, table]
  );
  const actual = Object.fromEntries(
    result.rows.map((row) => [row.column_name, [row.type, row.kind, row.position]])
  );
  if (
    Object.keys(actual).length !== Object.keys(expected).length ||
    Object.entries(expected).some(
      ([name, definition]) => JSON.stringify(actual[name]) !== JSON.stringify(definition)
    )
  ) {
    throw new Error(`CQL schema drift or missing table: ${table}`);
  }
  const tableInfo = (
    await client.execute(
      'SELECT default_time_to_live FROM system_schema.tables WHERE keyspace_name = ? AND table_name = ?',
      [keyspace, table]
    )
  ).first();
  if (!tableInfo || tableInfo.default_time_to_live !== 0)
    throw new Error(`CQL table must not expire rows: ${table}`);
}
async function verifyKeyspace(client: CqlClient, keyspace: string, datacenter: string) {
  const row = (
    await client.execute(
      'SELECT replication, durable_writes FROM system_schema.keyspaces WHERE keyspace_name = ?',
      [keyspace]
    )
  ).first();
  const replication = row?.replication;
  if (
    !row?.durable_writes ||
    !replication ||
    !String(replication.class).endsWith('NetworkTopologyStrategy') ||
    replication[datacenter] !== '1' ||
    Object.keys(replication).length !== 2
  ) {
    throw new Error(
      'CQL foundation requires durable, single-datacenter RF1 keyspaces; plan topology changes explicitly'
    );
  }
}

export async function runCqlSchema(config: CqlConfig, mode: 'apply' | 'verify', owner?: string) {
  if (
    ![config.keyspace, config.schemaKeyspace, config.datacenter].every((name) =>
      /^[a-z][a-z0-9_]{0,47}$/.test(name)
    )
  )
    throw new Error('Invalid CQL schema identifier');
  if (config.schemaKeyspace === config.keyspace)
    throw new Error('Schema journal must use a separate keyspace');
  if (config.username !== 'cartyx_admin')
    throw new Error('Schema commands require operator credentials');
  if (
    mode === 'apply' &&
    (!owner || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(owner))
  )
    throw new Error('Set CQL_MIGRATION_OWNER to a persistent UUID v4 before apply');
  const client = createCqlClient(config);
  const journal = `${config.schemaKeyspace}.schema_migrations`;
  try {
    await verifyKeyspace(client, config.keyspace, config.datacenter);
    if (mode === 'apply') {
      await client.execute(
        `CREATE KEYSPACE IF NOT EXISTS ${config.schemaKeyspace} WITH replication = {'class': 'NetworkTopologyStrategy', '${config.datacenter}': 1} AND durable_writes = true`,
        [],
        { ddl: true }
      );
    }
    await verifyKeyspace(client, config.schemaKeyspace, config.datacenter);
    if (mode === 'apply')
      await client.execute(
        `CREATE TABLE IF NOT EXISTS ${journal} (${journalDefinition}) WITH default_time_to_live = 0`,
        [],
        { ddl: true }
      );
    await verifyTable(client, config.schemaKeyspace, 'schema_migrations', {
      name: ['text', 'partition_key', 0],
      version: ['text', 'regular', -1],
      checksum: ['text', 'regular', -1],
      status: ['text', 'regular', -1],
      owner: ['uuid', 'regular', -1],
    });
    if (mode === 'apply') {
      await client.execute(
        `INSERT INTO ${journal} (name, version, checksum, status, owner) VALUES (?, ?, ?, ?, ?) IF NOT EXISTS`,
        ['cartyx', '0001', checksum, 'installing', cassandra.types.Uuid.fromString(owner!)]
      );
    }
    const record = (
      await client.execute(
        `SELECT version, checksum, status, owner FROM ${journal} WHERE name = ?`,
        ['cartyx'],
        lwtRead
      )
    ).first();
    if (
      !record ||
      record.version !== '0001' ||
      record.checksum !== checksum ||
      !['installing', 'complete'].includes(record.status)
    )
      throw new Error('CQL schema version/checksum mismatch or absent journal');
    if (record.status !== 'complete') {
      if (mode !== 'apply' || record.owner.toString() !== owner)
        throw new Error(
          'Migration unfinished; only its recorded owner may resume after the original job has stopped'
        );
      await client.execute(
        `CREATE TABLE IF NOT EXISTS ${config.keyspace}.control_state (${stateDefinition}) WITH default_time_to_live = 0`,
        [],
        { ddl: true }
      );
    }
    await verifyTable(client, config.keyspace, 'control_state', {
      scope: ['text', 'partition_key', 0],
      resource_type: ['text', 'partition_key', 1],
      resource_id: ['text', 'partition_key', 2],
      revision: ['uuid', 'regular', -1],
      payload: ['text', 'regular', -1],
    });
    if (record.status !== 'complete') {
      const completed = await client.execute(
        `UPDATE ${journal} SET status = ? WHERE name = ? IF owner = ? AND checksum = ? AND status = ?`,
        ['complete', 'cartyx', cassandra.types.Uuid.fromString(owner!), checksum, 'installing']
      );
      if (!completed.wasApplied())
        throw new Error('CQL schema completion was not applied; inspect journal before retrying');
    }
    return { version: '0001', checksum };
  } finally {
    await client.close();
  }
}
