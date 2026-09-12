// @vitest-environment node
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Socket } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { readGraphConfig } from '../../../../app/server/db/graph/config';
import { findIdentity, graphIdentity } from '../../../../app/server/db/graph/identity';
import { createGraphClient } from '../../../../app/server/db/graph/client';

const directory = mkdtempSync(join(tmpdir(), 'cartyx-graph-test-'));
writeFileSync(join(directory, 'password'), 'test-secret\n');
writeFileSync(join(directory, 'ca'), 'test-ca');
const env = {
  GREMLIN_URL: 'wss://localhost:18182/gremlin',
  GREMLIN_USERNAME: 'test-only',
  GREMLIN_PASSWORD_FILE: join(directory, 'password'),
  GREMLIN_CA_FILE: join(directory, 'ca'),
};
afterAll(() => rmSync(directory, { recursive: true }));
const entityId = 'abcdef123456abcdef123456';

describe('graph connection boundary', () => {
  it('requires explicit TLS endpoint and file credentials', () => {
    expect(readGraphConfig(env)).toMatchObject({
      username: 'test-only',
      password: 'test-secret',
      timeoutMs: 10000,
    });
    expect(() => readGraphConfig({})).toThrow('Missing GREMLIN_URL');
    for (const url of [
      'ws://localhost/gremlin',
      'wss://user:secret@localhost/gremlin',
      'wss://localhost/gremlin?password=secret',
      'wss://localhost/other',
    ]) {
      expect(() => readGraphConfig({ ...env, GREMLIN_URL: url })).toThrow();
    }
    for (const value of ['NaN', '0', '1.5', '15001']) {
      expect(() => readGraphConfig({ ...env, GREMLIN_TIMEOUT_MS: value })).toThrow(
        'GREMLIN_TIMEOUT_MS'
      );
    }
  });

  it('bounds a stalled TLS handshake and closes its socket without submitting a write', async () => {
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.resume();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected TCP address');
      const config = {
        ...readGraphConfig(env),
        url: `wss://127.0.0.1:${address.port}/gremlin`,
        timeoutMs: 150,
      };
      const started = Date.now();
      await expect(
        createGraphClient(config).execute(
          findIdentity(graphIdentity('User', entityId, { type: 'global' }))
        )
      ).rejects.toThrow(/Graph request (timeout|failed)/);
      expect(Date.now() - started).toBeLessThan(1500);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(sockets.size).toBe(0);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('application graph identities', () => {
  it('keeps legacy IDs and disambiguates user, campaign, and global scope', () => {
    expect(graphIdentity('User', entityId, { type: 'global' })).toEqual({
      entityId,
      kind: 'User',
      scope: 'global',
    });
    expect(graphIdentity('Character', entityId, { type: 'campaign', id: entityId }).scope).toBe(
      `campaign:${entityId}`
    );
    expect(graphIdentity('AudioAsset', entityId, { type: 'user', id: entityId }).scope).toBe(
      `user:${entityId}`
    );
    expect(() =>
      graphIdentity('Character', 'internal-janusgraph-id', { type: 'global' })
    ).toThrow();
    expect(() =>
      graphIdentity('Character', entityId, { type: 'campaign', id: '../global' })
    ).toThrow();
  });
});
