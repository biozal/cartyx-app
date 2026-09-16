// Disposable CI rehearsal only. Never changes a deployed configuration or issues
// a live credential. The candidate image is built from the separately pinned PR.
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
assert.equal(process.env.CARTYX_JANUSGRAPH_IMAGE, 'cartyx-janusgraph:identity-policy-fixture');
const run = (command, args, cwd = root, env = process.env) =>
  execFileSync(command, args, { cwd, env, stdio: 'inherit' });
const output = (args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
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
for (const key of ['gremlin-identity-password', 'gremlin-denied-password'])
  writeFileSync(resolve(secrets, key), randomBytes(32).toString('hex') + '\n', {
    mode: 0o644,
    flag: 'wx',
  });
// Stage the exact candidate boundary in this throwaway infrastructure checkout.
// Existing backup/restore helpers mount this same directory, so restored servers
// must boot through the identical guarded serializer/channelizer/authorizer.
const configPath = resolve(infra, 'deploy/charts/cartyx-data/files/janusgraph-config.groovy');
const original = readFileSync(configPath, 'utf8');
assert.ok(!original.includes('IdentityChannelizer'));
writeFileSync(
  configPath,
  original +
    `
// Application CI fixture only; never promote this staged configuration.
def fixtureCredentials = TinkerGraph.open(credentials)
fixtureCredentials.traversal(CredentialTraversalSource.class)
    .user('cartyx_identity', readSecret('gremlin-identity-password')).iterate()
fixtureCredentials.traversal(CredentialTraversalSource.class)
    .user('cartyx_denied', readSecret('gremlin-denied-password')).iterate()
fixtureCredentials.close()
config.channelizer = 'io.cartyx.graph.IdentityChannelizer'
config.maxContentLength = 65536
config.authorization = [authorizer: 'io.cartyx.graph.IdentityProfileAuthorizer', config: [:]]
config.serializers = [[className: 'io.cartyx.graph.IdentityGraphSONSerializer',
    config: [ioRegistries: ['org.janusgraph.graphdb.tinkerpop.JanusGraphIoRegistry']]]]
new File(root + '/server.yaml').text = yaml.dump(config)
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
  cpSync(witnessPath, resolve(retained, 'witness.json'), { errorOnExist: true, force: false });
  cpSync(packageDirectory, resolve(retained, 'bulk'), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
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
  cpSync(resolve(retained, 'witness.json'), witnessPath, { errorOnExist: true, force: false });
  cpSync(resolve(retained, 'bulk'), packageDirectory, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
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
