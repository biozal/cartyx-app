import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { Agent, request as httpsRequest } from 'node:https';
import type { EventEmitter } from 'node:events';
import gremlin from 'gremlin';
import type { GraphConnectionConfig } from '../../app/server/db/graph/config';
import { createGraphClient } from '../../app/server/db/graph/client';
import { submitGraphRequest } from '../../app/server/db/graph/transport';
import { findIdentity } from '../../app/server/db/graph/identity';
import {
  createGraphProfileStore,
  profileRevisionIdentity,
  profileUserIdentity,
} from '../../app/server/repositories/identity/graph-profiles';
import type { ProfileSnapshot } from '../../app/server/repositories/identity/profile-model';
import { profileFixture } from './profile-contract';

// This test intentionally bypasses the repository and the public driver request
// builder. Keep access to the pinned driver's internal request envelope here.
type RawConnection = {
  submit(processor: string, op: string, args: Record<string, unknown>): Promise<unknown>;
};
const writer = new gremlin.structure.io.GraphSONWriter() as unknown as {
  writeRequest(request: Record<string, unknown>): Buffer;
};
type Socket = EventEmitter & { send(data: Buffer | string): void; terminate(): void };
const require = createRequire(import.meta.url);
const WebSocket = require('ws') as new (url: string, options: Record<string, unknown>) => Socket;

async function rejectedFrame(config: GraphConnectionConfig, body: Buffer | string) {
  const socket = new WebSocket(config.url, { ca: config.ca, rejectUnauthorized: true });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Decoder rejection timed out')), 5000);
      const finish = (error?: Error) => {
        clearTimeout(timer);
        error ? reject(error) : resolve();
      };
      socket.once('open', () => socket.send(body));
      socket.once('error', () => finish(new Error('Unexpected TLS/WebSocket transport failure')));
      socket.once('close', () => finish());
      socket.once('message', (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          assert.equal(response.status.code, 498, 'Decoder must reject before authentication');
          assert.ok(!JSON.stringify(response).includes('private-payload-marker'));
          finish();
        } catch {
          finish(new Error('Unexpected decoder rejection response'));
        }
      });
    });
  } finally {
    socket.terminate();
  }
}

export async function identityAuthorizationContract(
  runtime: GraphConnectionConfig,
  operator: GraphConnectionConfig,
  track: (snapshot: ProfileSnapshot) => void
) {
  assert.equal(runtime.username, 'cartyx_identity');
  const graph = createGraphProfileStore(createGraphClient(runtime));
  const snapshot = profileFixture();
  track(snapshot);
  await graph.put(snapshot);
  const identity = profileRevisionIdentity(snapshot.userId, snapshot.snapshotId);
  const owner = profileUserIdentity(snapshot.userId);
  const allowed = findIdentity(owner).limit(2).label().getBytecode();
  const agent = new Agent();
  const client = new gremlin.driver.Client(runtime.url, {
    authenticator: new gremlin.driver.auth.PlainTextSaslAuthenticator(
      runtime.username,
      runtime.password
    ),
    agent,
    ca: runtime.ca,
    rejectUnauthorized: true,
    mimeType: 'application/vnd.gremlin-v3.0+json',
    traversalSource: 'g',
    pingEnabled: false,
  });
  const raw = (client as unknown as { _connection: RawConnection })._connection;
  const args = { gremlin: allowed, aliases: { g: 'g' } };
  const denied = async (processor: string, op: string, values: Record<string, unknown>) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await assert.rejects(
        Promise.race([
          raw.submit(processor, op, values),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error('Authorization response timed out')), 5000);
          }),
        ]),
        (error: unknown) => {
          const response = error as { statusCode?: number; message?: string };
          return (
            response.statusCode === 401 && !response.message?.includes('private-payload-marker')
          );
        },
        'Expected an explicit server authorization denial'
      );
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    assert.deepEqual((await client.submit(allowed)).toArray(), [
      new gremlin.process.Traverser('User', 1),
    ]);
    for (const traversal of [
      findIdentity(identity).drop(),
      findIdentity(identity).property('identityProfileFirstName', 'private-payload-marker'),
      findIdentity(owner).out('HAS_PROFILE_REVISION').drop(),
      findIdentity(owner).limit(2).label().sideEffect(gremlin.process.statics.drop()),
    ])
      await denied('traversal', 'bytecode', { ...args, gremlin: traversal.getBytecode() });
    await denied('', 'eval', { gremlin: "'private-payload-marker'", aliases: { g: 'g' } });
    for (const processor of ['session', 'other']) await denied(processor, 'bytecode', args);
    for (const op of ['close', 'eval', 'other']) await denied('traversal', op, args);
    for (const extra of [
      { session: randomUUID() },
      { manageTransaction: true },
      { language: 'gremlin-groovy' },
      { bindings: { secret: 'private-payload-marker' } },
      { aliases: { g: 'graph' } },
      { aliases: { g: 'g', other: 'g' } },
      { batchSize: 65 },
      { evaluationTimeout: 15001 },
      { userAgent: 'private-payload-marker' },
    ])
      await denied('traversal', 'bytecode', { ...args, ...extra });
    const sourced = new gremlin.process.Bytecode(allowed);
    sourced.addSource('withBulk', [false]);
    await denied('traversal', 'bytecode', { ...args, gremlin: sourced });
    const otherOwner = profileUserIdentity(randomBytes(12).toString('hex'));
    const __ = gremlin.process.statics;
    const crossOwner = findIdentity(otherOwner)
      .as('owner')
      .V()
      .has('scope', identity.scope)
      .has('kind', identity.kind)
      .has('entityId', identity.entityId)
      .coalesce(
        __.inE('HAS_PROFILE_REVISION').where(
          __.outV()
            .has('scope', otherOwner.scope)
            .has('kind', otherOwner.kind)
            .has('entityId', otherOwner.entityId)
        ),
        __.addE('HAS_PROFILE_REVISION').from_('owner')
      )
      .count();
    await denied('traversal', 'bytecode', { ...args, gremlin: crossOwner.getBytecode() });

    // Shared server handlers must not mix concurrent operator/service principals.
    const concurrent = await Promise.allSettled(
      Array.from({ length: 12 }, async () => {
        await Promise.all([
          submitGraphRequest(operator, '40 + 2').then((values) => assert.deepEqual(values, [42])),
          denied('traversal', 'bytecode', {
            ...args,
            gremlin: findIdentity(identity).drop().getBytecode(),
          }),
          graph
            .get(snapshot.userId, snapshot.snapshotId)
            .then((value) => assert.deepEqual(value, snapshot)),
        ]);
      })
    );
    assert.ok(
      concurrent.every((result) => result.status === 'fulfilled'),
      'Concurrent principal isolation failed'
    );
    assert.deepEqual((await client.submit(allowed)).toArray(), [
      new gremlin.process.Traverser('User', 1),
    ]);
  } finally {
    void client.close().catch(() => undefined);
    agent.destroy();
  }
  // Authentication failures are separate from authorization refusals. Real TLS
  // validation stays enabled for every path, including malformed frames.
  await assert.rejects(
    submitGraphRequest({ ...runtime, password: randomBytes(32).toString('hex') }, allowed)
  );
  await assert.rejects(submitGraphRequest({ ...runtime, username: 'unknown_fixture' }, allowed));
  const deniedPasswordFile = process.env.IDENTITY_GRAPH_DENIED_PASSWORD_FILE;
  assert.ok(deniedPasswordFile, 'Provide the authenticated denied-principal fixture');
  const deniedClient = new gremlin.driver.Client(runtime.url, {
    authenticator: new gremlin.driver.auth.PlainTextSaslAuthenticator(
      'cartyx_denied',
      readFileSync(deniedPasswordFile, 'utf8').trim()
    ),
    ca: runtime.ca,
    rejectUnauthorized: true,
    mimeType: 'application/vnd.gremlin-v3.0+json',
    pingEnabled: false,
  });
  try {
    await assert.rejects(
      deniedClient.submit(allowed),
      (error: unknown) => (error as { statusCode?: number }).statusCode === 401
    );
  } finally {
    await deniedClient.close();
  }
  const mime = 'application/vnd.gremlin-v3.0+json';
  const frame = (json: string) =>
    Buffer.concat([Buffer.from([mime.length]), Buffer.from(mime), Buffer.from(json)]);
  const base = JSON.parse(
    writer
      .writeRequest({ requestId: randomUUID(), op: 'bytecode', processor: 'traversal', args })
      .toString()
  );
  for (const type of [
    'g:Lambda',
    'g:Class',
    'g:Binding',
    'g:P',
    'g:SubgraphStrategy',
    'gx:Unknown',
  ]) {
    const request = structuredClone(base);
    request.args.gremlin = { '@type': type, '@value': 'private-payload-marker' };
    const json = JSON.stringify(request);
    await rejectedFrame(runtime, frame(json));
    await rejectedFrame(runtime, json);
  }
  await rejectedFrame(
    runtime,
    frame(JSON.stringify(base).replace('{', '{"op":"private-payload-marker",'))
  );
  await rejectedFrame(runtime, frame(JSON.stringify(base) + '{}'));
  for (const unsupported of [
    'application/vnd.graphbinary-v1.0',
    'application/vnd.gremlin-v2.0+json',
  ])
    await rejectedFrame(
      runtime,
      Buffer.concat([
        Buffer.from([unsupported.length]),
        Buffer.from(unsupported),
        Buffer.from('private-payload-marker'),
      ])
    );
  const httpStatus = await new Promise<number>((resolve, reject) => {
    const url = new URL(runtime.url.replace('wss:', 'https:'));
    const request = httpsRequest(
      url,
      { method: 'POST', ca: runtime.ca, rejectUnauthorized: true },
      (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      }
    );
    request.on('error', reject);
    request.setTimeout(5000, () => request.destroy(new Error('HTTP refusal timed out')));
    request.end(JSON.stringify({ gremlin: '40 + 2' }));
  });
  assert.ok(httpStatus >= 400 && httpStatus < 500, 'Plain HTTP evaluation must be refused');
  await assert.rejects(
    graph.put({ ...snapshot, content: { ...snapshot.content, role: 'gm' } }),
    /revision ID reused/i
  );
  assert.deepEqual(await graph.get(snapshot.userId, snapshot.snapshotId), snapshot);
  assert.deepEqual(
    await createGraphClient(operator).execute(
      findIdentity(owner).out('HAS_PROFILE_REVISION').count()
    ),
    [1]
  );
  console.log(
    'PASS: real JanusGraph identity TLS/SASL, explicit envelope/traversal denials, guarded decoding/MIME/HTTP, immutable content and concurrent operator/service isolation'
  );
}
