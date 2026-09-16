// Disposable CI rehearsal only. Never changes a deployed configuration or issues
// a live credential. Uses the pinned infrastructure's published database images.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const infra = resolve(root, '.local/identity-runtime-infrastructure');
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Use a disposable GitHub Actions runner');
assert.equal(process.env.CARTYX_INFRASTRUCTURE_DIR, infra);
// No image overrides: test the exact digests pinned by the infrastructure revision.
assert.equal(process.env.CARTYX_JANUSGRAPH_IMAGE, undefined);
assert.equal(process.env.CARTYX_CASSANDRA_IMAGE, undefined);
const run = (command, args, cwd = root, env = process.env) =>
  execFileSync(command, args, { cwd, env, stdio: 'inherit' });
const output = (args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
// cpSync preserves file modes but recreates directories using the process umask.
// Scope 077 to these synchronous private copies; database secret generation must
// retain its separate container-readable file policy.
const copyPrivate = (source, destination, recursive = false) => {
  const previousMask = process.umask(0o077);
  try {
    cpSync(source, destination, { recursive, errorOnExist: true, force: false });
  } finally {
    process.umask(previousMask);
  }
};

const composeFile = resolve(infra, 'deploy/local/data.compose.yaml');
const compose = ['compose', '-p', 'cartyx-local', '-f', composeFile];
assert.equal(output([...compose, 'ps', '-aq']), '', 'Refuse an existing source stack');
assert.equal(
  output(['ps', '-aq', '--filter', 'label=com.docker.compose.project=cartyx-restore']),
  '',
  'Refuse an existing restore stack'
);
assert.equal(existsSync(resolve(infra, '.local/data/local')), false, 'Refuse existing credentials');
assert.equal(existsSync(resolve(root, '.local/cql/identity-graph-persistence.json')), false);
assert.equal(
  output(['volume', 'ls', '-q', '--filter', 'name=^cartyx-local_cassandra-data$']),
  '',
  'Refuse existing source storage'
);

run(process.execPath, ['deploy/data/secrets.mjs', 'local'], infra);
const secrets = resolve(infra, '.local/data/local');
// The pinned infrastructure already configures the complete deployed boundary and
// provisions the cartyx_identity credential. Verify that, then add only an
// authenticated-but-denied principal. Existing backup/restore helpers mount this
// same throwaway directory, so restored servers boot through the same policy.
assert.ok(existsSync(resolve(secrets, 'gremlin-identity-password')));
writeFileSync(resolve(secrets, 'gremlin-denied-password'), randomBytes(32).toString('hex') + '\n', {
  mode: 0o644,
  flag: 'wx',
});
const configPath = resolve(infra, 'deploy/charts/cartyx-data/files/janusgraph-config.groovy');
const original = readFileSync(configPath, 'utf8');
for (const selected of [
  "config.channelizer = 'io.cartyx.graph.IdentityChannelizer'",
  "authorizer: 'io.cartyx.graph.IdentityProfileAuthorizer'",
  "className: 'io.cartyx.graph.IdentityGraphSONSerializer'",
  "user('cartyx_identity', identityPassword)",
])
  assert.ok(
    original.includes(selected),
    'Pinned infrastructure must configure the identity policy'
  );
writeFileSync(
  configPath,
  original +
    `
// Application CI fixture only: a valid principal the policy must deny.
def fixtureCredentials = TinkerGraph.open(credentials)
fixtureCredentials.traversal(CredentialTraversalSource.class)
    .user('cartyx_denied', readSecret('gremlin-denied-password')).iterate()
fixtureCredentials.close()
`
);
const operatorEnv = {
  ...process.env,
  GREMLIN_URL: 'wss://localhost:18182/gremlin',
  GREMLIN_USERNAME: 'cartyx_admin',
  GREMLIN_PASSWORD_FILE: resolve(secrets, 'gremlin-password'),
  GREMLIN_CA_FILE: resolve(secrets, 'tls.crt'),
};
const restrictedEnv = {
  ...operatorEnv,
  IDENTITY_GRAPH_OPERATOR_PASSWORD_FILE: resolve(secrets, 'gremlin-password'),
  IDENTITY_GRAPH_DENIED_PASSWORD_FILE: resolve(secrets, 'gremlin-denied-password'),
};
const npm = (args, env = operatorEnv) => run('npm', ['run', ...args], root, env);
const fixture = (mode, env = restrictedEnv) => npm(['cql:local', '--', mode], env);
const docker = (args) => run('docker', args);
const sourceVolume = 'cartyx-local_cassandra-data';
let restoreVolume;
let passed = false;
try {
  npm(['db:up']);
  npm(['graph:schema', '--', 'apply']);
  npm(['identity:graph-schema', '--', 'apply']);
  npm(['cql:local', '--', 'schema', 'apply']);
  fixture('identity-graph-test');
  fixture('identity-graph-seed');
  docker([...compose, 'stop', 'janusgraph']);
  docker([...compose, 'restart', 'cassandra']);
  docker([...compose, 'up', '-d', '--wait', '--wait-timeout', '600']);
  fixture('identity-graph-verify');
  fixture('identity-graph-test');
  console.log(
    'PASS: configured identity policy and application recovery after actual Cassandra/JanusGraph restart'
  );

  // Retain the exact pending plans/package for recovery in both independent
  // database copies. No replacement IDs, hashes or endpoint bindings are minted.
  fixture('identity-graph-seed');
  const witnessPath = resolve(root, '.local/cql/identity-graph-persistence.json');
  const witness = JSON.parse(readFileSync(witnessPath, 'utf8'));
  assert.match(witness.bulkWitness.directory, /^\.local\/cql\/identity-bulk-[0-9a-f-]{36}$/);
  const packageDirectory = resolve(root, witness.bulkWitness.directory);
  const retained = resolve(root, '.local/identity-policy-retained');
  mkdirSync(retained, { mode: 0o700 });
  copyPrivate(witnessPath, resolve(retained, 'witness.json'));
  copyPrivate(packageDirectory, resolve(retained, 'bulk'), true);
  run(process.execPath, ['deploy/data/smoke.mjs', 'seed'], infra, operatorEnv);
  run(process.execPath, ['deploy/data/backup.mjs', 'local-backup'], infra, operatorEnv);
  fixture('identity-graph-verify'); // Exact source cleanup before changing routes.
  docker([...compose, 'stop', 'janusgraph', 'cassandra']);
  const backupDirectory = resolve(infra, '.local/backups');
  const backups = readdirSync(backupDirectory).filter((name) => name.endsWith('.tar.gz.json'));
  assert.equal(backups.length, 1);
  run(
    process.execPath,
    ['deploy/data/backup.mjs', 'local-restore', resolve(backupDirectory, backups[0])],
    infra,
    operatorEnv
  );
  const restoreOverride = resolve(backupDirectory, 'restore.compose.yaml');
  const restoreCompose = [
    'compose',
    '-p',
    'cartyx-restore',
    '-f',
    composeFile,
    '-f',
    restoreOverride,
  ];
  const restored = JSON.parse(output(['inspect', 'cartyx-restore-cassandra-1']))[0];
  restoreVolume = restored.Mounts.find((mount) => mount.Destination === '/var/lib/cassandra')?.Name;
  assert.match(restoreVolume, /^cartyx-restore-[0-9]+$/);
  assert.notEqual(restoreVolume, sourceVolume);
  assert.equal(restored.State.Running, true);
  // Source is stopped. Give its loopback endpoint to the independent restored
  // server; retained package/CA/port bindings remain byte-for-byte unchanged.
  const override = readFileSync(restoreOverride, 'utf8');
  assert.ok(override.includes('127.0.0.1:18183:8182'));
  writeFileSync(restoreOverride, override.replace('127.0.0.1:18183:8182', '127.0.0.1:18182:8182'));
  docker([...restoreCompose, 'up', '-d', '--wait', '--wait-timeout', '600', 'janusgraph']);
  copyPrivate(resolve(retained, 'witness.json'), witnessPath);
  copyPrivate(resolve(retained, 'bulk'), packageDirectory, true);
  const restoreEnv = { ...restrictedEnv, IDENTITY_GRAPH_FIXTURE_PROJECT: 'cartyx-restore' };
  fixture('identity-graph-verify', restoreEnv);
  fixture('identity-graph-test', restoreEnv);
  assert.equal(existsSync(witnessPath), false);
  assert.deepEqual(readdirSync(resolve(root, '.local/identity-graph-runs')), []);
  console.log(
    'PASS: same pending application plans recovered through restricted identity credentials in independent restored storage; bypass contracts and exact cleanup passed'
  );
  docker([...restoreCompose, 'down']);
  docker(['volume', 'rm', restoreVolume]);
  restoreVolume = undefined;
  docker([...compose, 'up', '-d', '--wait', '--wait-timeout', '600']);
  fixture('identity-graph-test');
  console.log('PASS: original source storage remains healthy after independent restore');
  rmSync(retained, { recursive: true });
  passed = true;
} finally {
  // On failure, leave private recovery material on the ephemeral runner, never
  // upload credentials, graph logs, retained plans or database archives.
  if (passed) docker([...compose, 'down', '--volumes']);
  else
    console.error(
      'Policy rehearsal failed; private evidence remains on the disposable runner only'
    );
}
