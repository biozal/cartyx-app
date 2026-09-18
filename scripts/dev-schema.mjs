/**
 * Installs every schema the application needs into the local database stack:
 * the identity graph foundation, the entity component schema, and the Cassandra
 * state keyspace.
 *
 * Schema work is operator work, so this reads the operator credentials from the
 * infrastructure checkout rather than the application's own environment — the
 * running app connects as the restricted principal and cannot create a schema.
 * Every step is idempotent, so an already-installed stack costs one verification
 * round trip per schema.
 */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const infrastructure = process.env.CARTYX_INFRASTRUCTURE_DIR;
if (infrastructure && !isAbsolute(infrastructure))
  throw new Error('CARTYX_INFRASTRUCTURE_DIR must be an absolute checkout path');
const secrets = resolve(
  infrastructure ?? resolve(root, '../cartyx-infrastructure'),
  '.local/data/local'
);
if (!existsSync(resolve(secrets, 'gremlin-password')))
  throw new Error(`No local database credentials at ${secrets}. Run \`npm run db:up\` first.`);

const step = (command, args, env) => {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const operator = {
  GREMLIN_URL: process.env.GREMLIN_URL ?? 'wss://localhost:18182/gremlin',
  GREMLIN_USERNAME: 'cartyx_admin',
  GREMLIN_PASSWORD_FILE: resolve(secrets, 'gremlin-password'),
  GREMLIN_CA_FILE: resolve(secrets, 'tls.crt'),
};

step('npx', ['tsx', 'scripts/graph/cli.ts', 'apply'], operator);
step('npx', ['tsx', 'scripts/identity/profile-schema-cli.ts', 'apply'], operator);

if (process.env.CQL_CONTACT_POINT?.trim()) {
  // A reachable CQL endpoint is already configured: the Compose stack's loopback
  // forwarder, or a port-forward into a cluster. The migration owner identifies who
  // holds an interrupted migration's lease, so it must survive re-runs.
  mkdirSync(resolve(root, '.local/cql'), { recursive: true, mode: 0o700 });
  const ownerFile = resolve(root, '.local/cql/local-schema-owner');
  if (!existsSync(ownerFile)) writeFileSync(ownerFile, randomUUID(), { mode: 0o600, flag: 'wx' });
  step('npx', ['tsx', 'scripts/cql/cli.ts', 'apply'], {
    CQL_ADMIN_PASSWORD_FILE: resolve(secrets, 'cassandra-admin-password'),
    CQL_CA_FILE: process.env.CQL_CA_FILE ?? resolve(secrets, 'tls.crt'),
    CQL_MIGRATION_OWNER: readFileSync(ownerFile, 'utf8').trim(),
  });
} else {
  // No endpoint configured: fall back to the Compose-only helper, which starts its
  // own short-lived forwarder and supplies every CQL setting itself.
  step(process.execPath, ['scripts/cql/local.mjs', 'schema', 'apply']);
}
