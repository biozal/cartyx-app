// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
vi.unmock('mongoose');
import mongoose from 'mongoose';
import { chmod, mkdtemp, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bulkTargetFixture,
  writeBulkArchiveFixture,
} from '../../../scripts/identity/bulk-contract';
import {
  importBytesDigest,
  loadIdentityImportPackage,
  prepareIdentityImportPackage,
  identityImportTarget,
} from '../../../scripts/identity/bulk-package';
import {
  createIdentityBulkImporter,
  IdentityBulkImportError,
} from '../../../scripts/identity/bulk-import';
import { importSourceFixture } from '../../../scripts/identity/import-contract';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'cartyx-bulk-unit-'));
  roots.push(root);
  const source = join(root, 'source');
  const directory = join(root, 'package');
  const target = bulkTargetFixture();
  await writeBulkArchiveFixture(source);
  await prepareIdentityImportPackage(source, directory, target);
  return { root, source, directory, target };
}
it('freezes original BSON and exact IDs without credentials or private values in reports', async () => {
  const { source, directory, target } = await fixture();
  for (const name of [
    'users.bson',
    'campaigns.bson',
    'audit.json',
    'catalog.json',
    'manifest.json',
  ])
    expect(await readFile(join(directory, 'archive', name))).toEqual(
      await readFile(join(source, name))
    );
  const first = await loadIdentityImportPackage(directory, target);
  expect(await loadIdentityImportPackage(directory, target)).toEqual(first);
  expect(first.manifest.users).toBe(2);
  expect(first.manifest.campaigns).toBe(1);
  expect(JSON.stringify(first.manifest)).not.toContain('ciphertext');
  expect(JSON.stringify(first.manifest)).not.toContain(first.plans[0].account.userId);
  const raw = mongoose.mongo.BSON.deserialize(await readFile(join(source, 'users.bson')), {
    allowObjectSmallerThanBufferSize: true,
  });
  expect(first.plans[0].account.tokens).toEqual(raw.oauthTokens);
  expect(
    await prepareIdentityImportPackage(source, directory, target).catch(() => null)
  ).toBeNull();
  expect(await loadIdentityImportPackage(directory, target)).toEqual(first);
});
it('binds canonical endpoints, environment/keyspace and CA contents without retaining credentials', () => {
  const cql = {
    contactPoint: 'localhost',
    port: 9042,
    servername: 'localhost',
    datacenter: 'dc1',
    keyspace: 'cartyx_dev_state',
    schemaKeyspace: 'cartyx_dev_schema',
    username: 'cartyx_state' as const,
    password: 'private-cql-password',
    ca: Buffer.from('synthetic-ca'),
    timeoutMs: 1000,
  };
  const graph = {
    url: 'wss://localhost:28182/gremlin',
    username: 'cartyx_admin',
    password: 'private-graph-password',
    ca: Buffer.from('synthetic-ca'),
    timeoutMs: 1000,
  };
  const target = identityImportTarget('dev', cql, graph);
  expect(JSON.stringify(target)).not.toContain('private-');
  expect(target.cql.caSha256).toBe(importBytesDigest(cql.ca));
  expect(() => identityImportTarget('prod', cql, graph)).toThrow();
  expect(() =>
    identityImportTarget('dev', cql, { ...graph, url: 'wss://user:secret@localhost/gremlin' })
  ).toThrow();
});
it('refuses changed targets and damaged packages before any target access', async () => {
  const { directory, target } = await fixture();
  const touched = vi.fn(async () => {
    throw new Error('Unexpected database access');
  });
  const state = { get: touched, create: touched, replace: touched };
  const graph = { get: touched, put: touched };
  for (const changed of [
    { ...target, cql: { ...target.cql, port: 9043 } },
    { ...target, cql: { ...target.cql, caSha256: 'c'.repeat(64) } },
    { ...target, graph: { ...target.graph, url: 'wss://another.invalid/gremlin' } },
    { ...target, graph: { ...target.graph, caSha256: 'c'.repeat(64) } },
    {
      ...target,
      environment: 'prod' as const,
      cql: { ...target.cql, keyspace: 'cartyx_prod_state' as const },
    },
  ])
    await expect(
      createIdentityBulkImporter(state, graph, changed).apply(directory)
    ).rejects.toEqual(new IdentityBulkImportError(null));
  await writeFile(join(directory, 'archive', 'users.bson'), Buffer.alloc(4));
  await expect(createIdentityBulkImporter(state, graph, target).apply(directory)).rejects.toEqual(
    new IdentityBulkImportError(null)
  );
  expect(touched).not.toHaveBeenCalled();
});
it.each([
  'missing_marker',
  'plan_hash',
  'changed_projection',
  'reordered_plans',
  'world_readable',
  'symlink_file',
  'symlink_directory',
  'oversized_marker',
])('rejects %s packages', async (failure) => {
  const { root, directory, target } = await fixture();
  const marker = join(directory, 'manifest.json');
  if (failure === 'missing_marker') await rm(marker);
  if (failure === 'plan_hash') await writeFile(join(directory, 'plans.json'), '[]');
  if (failure === 'changed_projection' || failure === 'reordered_plans') {
    const plans = JSON.parse(await readFile(join(directory, 'plans.json'), 'utf8'));
    if (failure === 'changed_projection') plans[0].snapshot.content.firstName = 'substituted';
    else plans.reverse();
    const bytes = Buffer.from(JSON.stringify(plans));
    await writeFile(join(directory, 'plans.json'), bytes);
    const manifest = JSON.parse(await readFile(marker, 'utf8'));
    manifest.plansSha256 = importBytesDigest(bytes);
    await writeFile(marker, JSON.stringify(manifest));
  }
  if (failure === 'world_readable') await chmod(join(directory, 'plans.json'), 0o644);
  if (failure === 'symlink_file') {
    const other = join(root, 'other.json');
    await writeFile(other, await readFile(marker), { mode: 0o600 });
    await rm(marker);
    await symlink(other, marker);
  }
  if (failure === 'symlink_directory') {
    const link = join(root, 'link');
    await symlink(directory, link);
    await expect(loadIdentityImportPackage(link, target)).rejects.toThrow();
    return;
  }
  if (failure === 'oversized_marker') await truncate(marker, 16385);
  await expect(loadIdentityImportPackage(directory, target)).rejects.toThrow();
});
it('refuses source-environment mismatch, mapping blockers and broken membership references without publishing completion', async () => {
  const { root, source, target } = await fixture();
  const sourceManifest = join(source, 'manifest.json');
  const manifest = JSON.parse(await readFile(sourceManifest, 'utf8'));
  manifest.source = 'prod';
  await writeFile(sourceManifest, JSON.stringify(manifest));
  const mismatched = join(root, 'mismatched');
  await expect(prepareIdentityImportPackage(source, mismatched, target)).rejects.toThrow();
  await expect(readFile(join(mismatched, 'manifest.json'))).rejects.toThrow();
  for (const failure of ['unknown', 'reference']) {
    const raw = mongoose.mongo.BSON.deserialize(importSourceFixture());
    if (failure === 'unknown') raw.unreviewed = 'private unknown value';
    else raw.campaigns = [{ campaignId: new mongoose.mongo.BSON.ObjectId() }];
    const badSource = join(root, `${failure}-source`);
    const destination = join(root, failure);
    await writeBulkArchiveFixture(badSource, [mongoose.mongo.BSON.serialize(raw)]);
    await expect(prepareIdentityImportPackage(badSource, destination, target)).rejects.toThrow();
    await expect(readFile(join(destination, 'manifest.json'))).rejects.toThrow();
  }
});
it('publishes one package under competing preparation and never replaces its plans', async () => {
  const { root, source, target } = await fixture();
  const directory = join(root, 'concurrent');
  const outcomes = await Promise.allSettled(
    Array.from({ length: 4 }, () => prepareIdentityImportPackage(source, directory, target))
  );
  expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect((await loadIdentityImportPackage(directory, target)).manifest.users).toBe(2);
});

it('refuses a destination inside the original archive without modifying source', async () => {
  const { source, target } = await fixture();
  await expect(
    prepareIdentityImportPackage(source, join(source, 'nested'), target)
  ).rejects.toThrow();
  await expect(readFile(join(source, 'nested', 'manifest.json'))).rejects.toThrow();
});
