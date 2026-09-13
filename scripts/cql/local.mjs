import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const infra = process.env.CARTYX_INFRASTRUCTURE_DIR ?? resolve(root, '../cartyx-infrastructure');
const [action, mode] = process.argv.slice(2);
if (
  ![
    'schema',
    'test',
    'identity-graph-test',
    'identity-graph-seed',
    'identity-graph-verify',
    'seed-persistence',
    'verify-persistence',
  ].includes(action) ||
  (action === 'schema' && !['apply', 'verify'].includes(mode))
)
  throw new Error(
    'Usage: cql:local -- schema apply|verify, test, identity-graph-test [manifest], identity-graph-seed, identity-graph-verify, seed-persistence, or verify-persistence'
  );
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error || result.status !== 0)
    throw new Error(`${command} failed (${result.status ?? 'spawn'}): ${result.stderr ?? ''}`);
  return result.stdout?.trim();
};
// Reuse the running stack's image/network. This helper only forwards encrypted CQL
// for the duration of an operator command; no permanent database host port is added.
const container = JSON.parse(run('docker', ['inspect', 'cartyx-local-cassandra-1']))[0];
if (!container.State.Running || !container.NetworkSettings.Networks['cartyx-local_default'])
  throw new Error('Start the local database stack with npm run db:up');
// Bulk restart recovery binds the exact transport endpoint. Reuse its original
// loopback port or fail if occupied; never silently remap a retained import target.
let retainedPort = '';
const witnessPath = resolve(root, '.local/cql/identity-graph-persistence.json');
if (action === 'identity-graph-verify' && existsSync(witnessPath)) {
  const witness = JSON.parse(readFileSync(witnessPath, 'utf8'));
  const port = witness.bulkWitness?.target?.cql?.port;
  if (witness.bulkWitness) {
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('Invalid retained bulk-import CQL port');
    retainedPort = String(port);
  }
}
const name = `cartyx-cql-proxy-${randomUUID()}`;
const proxy = `import socket, socketserver, threading
class Handler(socketserver.BaseRequestHandler):
 def handle(self):
  upstream = socket.create_connection(('cassandra', 9042), timeout=5)
  upstream.settimeout(None)
  def copy(source, target):
   try:
    while True:
     data = source.recv(65536)
     if not data: break
     target.sendall(data)
   except OSError: pass
   finally:
    try: target.shutdown(socket.SHUT_WR)
    except OSError: pass
  thread = threading.Thread(target=copy, args=(self.request, upstream), daemon=True)
  thread.start()
  copy(upstream, self.request)
  thread.join()
  upstream.close()
class Server(socketserver.ThreadingTCPServer):
 allow_reuse_address = True
 daemon_threads = True
Server(('0.0.0.0', 9042), Handler).serve_forever()
`;
mkdirSync(resolve(root, '.local/cql'), { recursive: true, mode: 0o700 });
const ownerFile = resolve(root, '.local/cql/local-schema-owner');
if (!existsSync(ownerFile)) writeFileSync(ownerFile, randomUUID(), { mode: 0o600, flag: 'wx' });
try {
  run('docker', [
    'run',
    '-d',
    '--rm',
    '--name',
    name,
    '--network',
    'cartyx-local_default',
    '-p',
    `127.0.0.1:${retainedPort}:9042`,
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--memory',
    '64m',
    '--pids-limit',
    '64',
    '--entrypoint',
    'python3',
    container.Image,
    '-u',
    '-c',
    proxy,
  ]);
  const port = run('docker', ['port', name, '9042/tcp']).split(':').at(-1);
  const secrets = resolve(infra, '.local/data/local');
  run(
    process.execPath,
    [
      '--import',
      'tsx',
      action.startsWith('identity-graph-')
        ? action === 'identity-graph-test'
          ? 'scripts/identity/graph-integration.ts'
          : 'scripts/identity/graph-persistence.ts'
        : `scripts/cql/${action === 'schema' ? 'cli' : action === 'test' ? 'integration' : 'persistence'}.ts`,
      ...(action.endsWith('-persistence') ||
      ['identity-graph-seed', 'identity-graph-verify'].includes(action)
        ? [action]
        : []),
      ...(mode ? [mode] : []),
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        ...(action.startsWith('identity-graph-') && {
          GREMLIN_URL: 'wss://localhost:18182/gremlin',
          GREMLIN_USERNAME: 'cartyx_admin',
          GREMLIN_PASSWORD_FILE: resolve(secrets, 'gremlin-password'),
          GREMLIN_CA_FILE: resolve(secrets, 'tls.crt'),
        }),
        CQL_CONTACT_POINT: '127.0.0.1',
        CQL_PORT: port,
        CQL_TLS_SERVER_NAME: 'localhost',
        CQL_DATACENTER: 'dc1',
        CQL_STATE_KEYSPACE: 'cartyx_state',
        CQL_CA_FILE: resolve(secrets, 'tls.crt'),
        CQL_PASSWORD_FILE: resolve(secrets, 'cassandra-state-password'),
        CQL_ADMIN_PASSWORD_FILE: resolve(secrets, 'cassandra-admin-password'),
        CQL_MIGRATION_OWNER: readFileSync(ownerFile, 'utf8').trim(),
      },
    }
  );
} finally {
  run('docker', ['rm', '-f', name]);
}
