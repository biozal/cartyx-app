import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import gremlin from 'gremlin';
import { readGraphConfig } from '../../app/server/db/graph/config';
import { createGraphClient } from '../../app/server/db/graph/client';
import {
  findIdentity,
  graphIdentity,
  type GraphIdentity,
} from '../../app/server/db/graph/identity';
import { checkSchema } from './schema';
import { submitGraphRequest } from '../../app/server/db/graph/transport';

const config = readGraphConfig();
const client = createGraphClient(config);
const g = new gremlin.structure.Graph().traversal();
const id = () => randomBytes(12).toString('hex');
const campaign = id();
const entityId = id();
const left = graphIdentity('GraphFoundationProbe', entityId, { type: 'campaign', id: campaign });
const right = graphIdentity('GraphFoundationProbe', id(), { type: 'campaign', id: campaign });
const other = graphIdentity('GraphFoundationProbe', entityId, { type: 'campaign', id: id() });
const race = graphIdentity('GraphFoundationProbe', id(), { type: 'campaign', id: campaign });
const invalid = graphIdentity('GraphFoundationProbe', id(), { type: 'campaign', id: campaign });
const fixtures = [left, right, other, race, invalid];
mkdirSync('.local/graph-runs', { recursive: true, mode: 0o700 });
const manifest = `.local/graph-runs/${campaign}.json`;
writeFileSync(manifest, JSON.stringify({ endpoint: config.url, fixtures }, null, 2), {
  mode: 0o600,
});
const insert = (identity: GraphIdentity) =>
  g
    .addV('GraphFoundationProbe')
    .property('scope', identity.scope)
    .property('kind', identity.kind)
    .property('entityId', identity.entityId);

try {
  await checkSchema(config); // Tests never install schema implicitly.
  const versions = await Promise.all([checkSchema(config, true), checkSchema(config, true)]);
  assert.deepEqual(
    versions[0],
    versions[1],
    'Concurrent migration requests must serialize and agree'
  );
  await assert.rejects(
    submitGraphRequest(
      config,
      readFileSync(new URL('./0001-foundation.groovy', import.meta.url), 'utf8'),
      { applySchema: true, checksum: 'incorrect-checksum' }
    ),
    /Graph request failed/
  );
  await checkSchema(config);
  for (const identity of [left, right, other]) {
    await client.execute(
      insert(identity).property('graphProbeValue', identity === other ? 'other-scope' : 'initial')
    );
  }
  assert.deepEqual(await client.execute(findIdentity(other).values('graphProbeValue')), [
    'other-scope',
  ]);
  assert.deepEqual(
    await client.execute(findIdentity({ ...left, kind: 'DifferentKind' }).count()),
    [0]
  );
  await client.execute(
    findIdentity(left).property('graphProbeValue', "text'); graph.tx().commit(); // 🐉")
  );
  assert.deepEqual(await client.execute(findIdentity(left).values('graphProbeValue')), [
    "text'); graph.tx().commit(); // 🐉",
  ]);
  // Endpoint resolution uses application IDs, never Java long vertex IDs.
  await client.execute(
    findIdentity(left)
      .as('left')
      .V()
      .has('scope', right.scope)
      .has('kind', right.kind)
      .has('entityId', right.entityId)
      .addE('GRAPH_FOUNDATION_LINK')
      .from_('left')
      .id()
  );
  assert.deepEqual(
    await client.execute(
      findIdentity(left)
        .out('GRAPH_FOUNDATION_LINK')
        .has('scope', left.scope)
        .limit(10)
        .values('entityId')
    ),
    [right.entityId]
  );
  assert.deepEqual(
    await client.execute(
      findIdentity(other).out('GRAPH_FOUNDATION_LINK').limit(10).values('entityId')
    ),
    []
  );
  // A duplicate identity loses the unique index: a conflict, not an unknown fault.
  await assert.rejects(client.execute(insert(left)), /Graph request (failed|conflict)/);
  const attempts = await Promise.allSettled(
    Array.from({ length: 4 }, () => client.execute(insert(race)))
  );
  assert.equal(
    attempts.filter((r) => r.status === 'fulfilled').length,
    1,
    'Unique index must reject concurrent duplicate writes'
  );
  assert.deepEqual(await client.execute(findIdentity(race).count()), [1]);
  await assert.rejects(
    client.execute(insert(invalid).property('unplannedFoundationProperty', 'no')),
    /Graph request failed/
  );
  assert.deepEqual(
    await client.execute(findIdentity(invalid).count()),
    [0],
    'Failed mutation must roll back'
  );
  await assert.rejects(
    client.execute(g.V().has('graphProbeValue', 'initial').limit(1)),
    /Graph request failed/
  );
  await assert.rejects(
    createGraphClient({ ...config, password: randomBytes(32).toString('hex') }).execute(
      findIdentity(left).count()
    ),
    /Graph request failed/
  );
  await assert.rejects(
    createGraphClient({ ...config, ca: Buffer.from('untrusted') }).execute(
      findIdentity(left).count()
    ),
    /Graph request failed/
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.execute(insert(invalid), controller.signal), /Graph request aborted/);
  assert.deepEqual(await client.execute(findIdentity(invalid).count()), [0]);
  assert.deepEqual(
    await client.execute(findIdentity(left).count()),
    [1],
    'A fresh request works after failures'
  );
  process.stdout.write(
    'PASS: schema repeat/concurrency, scoped identities, bytecode CRUD/edges, duplicate locking, rollback, scan rejection, TLS/auth and reconnect\n'
  );
} finally {
  // Only exact identities generated by this invocation, including uncertain writes.
  const cleanup = await Promise.allSettled(
    fixtures.map(async (identity) => {
      await client.execute(findIdentity(identity).hasLabel('GraphFoundationProbe').drop());
      assert.deepEqual(await client.execute(findIdentity(identity).count()), [0]);
    })
  );
  const failures = cleanup.filter((result) => result.status === 'rejected');
  if (failures.length)
    throw new Error(`Probe cleanup incomplete; exact fixture IDs retained in ${manifest}`);
  unlinkSync(manifest);
}
