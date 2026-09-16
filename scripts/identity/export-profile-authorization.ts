import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import gremlin from 'gremlin';
import { createGraphProfileStore } from '../../app/server/repositories/identity/graph-profiles';
import {
  profileDigest,
  type ProfileSnapshot,
} from '../../app/server/repositories/identity/profile-model';

// Synthetic fixtures only. The infrastructure JVM tests consume actual JS GraphSON,
// so policy compatibility is not inferred from independently hand-written traversals.
const output = process.argv[2];
assert.ok(output, 'Provide an output JSON path');
assert.ok(process.argv[3] === undefined || process.argv[3] === '--check', 'Unknown mode');
const fixtures: { name: string; requests: unknown[] }[] = [];
// The installed 3.7.6 writer defaults to GraphSON 3; @types/gremlin 3.6 omits
// writeRequest and Bytecode.stepInstructions. Keep those adapters confined here.
const writer = new gremlin.structure.io.GraphSONWriter() as unknown as {
  writeRequest(request: {
    requestId: string;
    op: string;
    processor: string;
    args: Record<string, unknown>;
  }): Buffer;
};
const full: ProfileSnapshot['content'] = {
  firstName: 'Synthetic 😀 "first"\nname',
  lastName: 'Synthetic last name',
  avatarUrl: 'https://example.invalid/avatar',
  role: 'gm',
  rulerColor: '#aBcD09',
  createdAt: '2026-09-15T00:00:00.000Z',
  lastLoginAt: '2026-09-15T12:34:56.789Z',
};
for (const [index, content] of [
  full,
  Object.fromEntries(Object.keys(full).map((k) => [k, null])) as ProfileSnapshot['content'],
].entries()) {
  const snapshot: ProfileSnapshot = {
    userId: '111111111111111111111111',
    snapshotId: (index + 2).toString(16).repeat(24),
    content,
  };
  const properties = new Map<string, string[]>([
    ['scope', ['user:' + snapshot.userId]],
    ['kind', ['UserProfileRevision']],
    ['entityId', [snapshot.snapshotId]],
    ['identityProfileDigest', [profileDigest(snapshot)]],
  ]);
  for (const [key, value] of Object.entries(content)) {
    if (value !== null)
      properties.set('identityProfile' + key[0].toUpperCase() + key.slice(1), [value]);
  }
  const requests: unknown[] = [];
  const store = createGraphProfileStore({
    async execute(traversal) {
      const bytecode = traversal.getBytecode();
      requests.push(
        JSON.parse(
          writer
            .writeRequest({
              requestId: `00000000-0000-4000-8000-${String(index * 100 + requests.length + 1).padStart(12, '0')}`,
              op: 'bytecode',
              processor: 'traversal',
              args: {
                gremlin: bytecode,
                aliases: { g: 'g' },
                batchSize: 64,
                evaluationTimeout: 9950,
                userAgent: 'cartyx-graph-foundation',
              },
            })
            .toString()
        )
      );
      const steps = (bytecode as unknown as { stepInstructions: readonly (readonly unknown[])[] })
        .stepInstructions;
      if (steps.some((step) => step[0] === 'project'))
        return [
          new Map<string, unknown>([
            ['label', 'UserProfileRevision'],
            ['properties', properties],
          ]),
        ];
      if (steps.at(-1)?.[0] === 'label') return ['User'];
      return [1];
    },
  });
  await store.put(snapshot);
  assert.deepEqual(await store.get(snapshot.userId, snapshot.snapshotId), snapshot);
  assert.equal(requests.length, 9);
  fixtures.push({ name: index === 0 ? 'all-properties' : 'null-properties', requests });
}
const serialized = JSON.stringify({ version: 1, fixtures }, null, 2) + '\n';
if (process.argv[3] === '--check') {
  assert.ok(
    serialized === (await readFile(output, 'utf8')),
    'Profile traversal contract changed; coordinate the server policy and fixture before activation'
  );
  console.log('Application profile requests match the pinned server policy fixture');
} else {
  await writeFile(output, serialized);
  console.log('Exported synthetic profile authorization requests');
}
