import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename } from 'node:fs/promises';
import { basename, dirname, join, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import type { CqlConfig } from '../../app/server/db/cql/config';
import type { GraphConnectionConfig } from '../../app/server/db/graph/config';
import {
  parseProfile,
  profileOperationId,
} from '../../app/server/repositories/identity/profile-model';
import { verifyArchive } from './archive';
import { parseIdentityImportPlan, type IdentityImportPlan } from './import-account';
import { mapIdentitySource, verifyIdentityImportSource } from './import-source';

const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const host = z
  .string()
  .max(253)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/);
const targetSchema = z
  .object({
    environment: z.enum(['local', 'dev', 'prod']),
    cql: z
      .object({
        contactPoint: host,
        port: z.number().int().min(1).max(65535),
        servername: host,
        datacenter: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
        keyspace: z.enum(['cartyx_state', 'cartyx_dev_state', 'cartyx_prod_state']),
        caSha256: hashSchema,
      })
      .strict(),
    graph: z
      .object({
        url: z
          .string()
          .max(2048)
          .refine((value) => {
            try {
              const url = new URL(value);
              return (
                url.toString() === value &&
                url.protocol === 'wss:' &&
                !url.username &&
                !url.password &&
                !url.search &&
                !url.hash &&
                url.pathname === '/gremlin'
              );
            } catch {
              return false;
            }
          }),
        caSha256: hashSchema,
      })
      .strict(),
  })
  .strict()
  .refine(
    (target) =>
      target.cql.keyspace ===
      (target.environment === 'local' ? 'cartyx_state' : `cartyx_${target.environment}_state`)
  );
export type IdentityImportTarget = z.infer<typeof targetSchema>;
const MAX_PLANS = 4096;
const MAX_PLAN_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;
const manifestSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal('cartyx-identity-bulk-import'),
    complete: z.literal(true),
    batchId: profileOperationId,
    target: targetSchema,
    archiveManifestSha256: hashSchema,
    plansSha256: hashSchema,
    users: z.number().int().min(0).max(MAX_PLANS),
    campaigns: z.number().int().nonnegative().max(0xffffffff),
  })
  .strict();
export type IdentityImportPackage = {
  manifest: z.infer<typeof manifestSchema>;
  digest: string;
  plans: IdentityImportPlan[];
};
export const importBytesDigest = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
const encode = (value: unknown) => Buffer.from(JSON.stringify(value) + '\n');
function check(condition: unknown): asserts condition {
  if (!condition) throw new Error('Identity bulk import package verification failed');
}
export const parseIdentityImportTarget = (input: unknown) => parseProfile(targetSchema, input);

/** Whitelisted endpoints and CA fingerprints only. Never persist credentials or secret-file paths. */
export function identityImportTarget(
  environment: IdentityImportTarget['environment'],
  cql: CqlConfig,
  graph: GraphConnectionConfig
): IdentityImportTarget {
  return parseIdentityImportTarget({
    environment,
    cql: {
      contactPoint: cql.contactPoint,
      port: cql.port,
      servername: cql.servername,
      datacenter: cql.datacenter,
      keyspace: cql.keyspace,
      caSha256: importBytesDigest(cql.ca),
    },
    graph: { url: graph.url, caSha256: importBytesDigest(graph.ca) },
  });
}
async function privateDirectory(path: string) {
  const stat = await lstat(path);
  check(stat.isDirectory() && stat.uid === process.getuid?.() && (stat.mode & 0o077) === 0);
}
async function privateFile(path: string, maximum: number) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    check(
      stat.isFile() &&
        stat.uid === process.getuid?.() &&
        (stat.mode & 0o077) === 0 &&
        stat.size <= maximum
    );
    return { file, size: stat.size };
  } catch (error) {
    await file.close();
    throw error;
  }
}
async function readPrivate(path: string, maximum: number) {
  const { file, size } = await privateFile(path, maximum);
  try {
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const result = await file.read(bytes, offset, size - offset, offset);
      check(result.bytesRead > 0);
      offset += result.bytesRead;
    }
    check((await file.stat()).size === size);
    return bytes;
  } finally {
    await file.close();
  }
}
async function syncDirectory(path: string) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    await file.sync();
  } finally {
    await file.close();
  }
}
async function writePrivate(path: string, bytes: Buffer) {
  const file = await open(path, 'wx', 0o600);
  try {
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
}
async function copyPrivate(source: string, target: string, maximum: number) {
  const { file: input, size } = await privateFile(source, maximum);
  try {
    const output = await open(target, 'wx', 0o600);
    try {
      const buffer = Buffer.alloc(Math.min(size, 1024 * 1024));
      let position = 0;
      while (position < size) {
        const result = await input.read(
          buffer,
          0,
          Math.min(buffer.length, size - position),
          position
        );
        check(result.bytesRead > 0);
        await output.writeFile(buffer.subarray(0, result.bytesRead));
        position += result.bytesRead;
      }
      check((await input.stat()).size === size);
      await output.sync();
    } finally {
      await output.close();
    }
  } finally {
    await input.close();
  }
}

/** Offline preparation. Publish completion last; never overwrite or resume an incomplete directory. */
export async function prepareIdentityImportPackage(
  source: string,
  directory: string,
  input: IdentityImportTarget
) {
  const target = parseIdentityImportTarget(input);
  await privateDirectory(source);
  await privateDirectory(dirname(directory));
  const sourcePath = await realpath(source);
  const destinationPath = join(await realpath(dirname(directory)), basename(directory));
  check(destinationPath !== sourcePath && !destinationPath.startsWith(sourcePath + sep));
  await mkdir(directory, { mode: 0o700 }); // Exclusive directory creation chooses the only preparer.
  await syncDirectory(dirname(directory));
  const archive = join(directory, 'archive');
  await mkdir(archive, { mode: 0o700 });
  for (const name of [
    'users.bson',
    'campaigns.bson',
    'catalog.json',
    'audit.json',
    'manifest.json',
  ])
    await copyPrivate(
      join(source, name),
      join(archive, name),
      name.endsWith('.bson') ? MAX_ARCHIVE_BYTES : 16 * 1024 * 1024
    );
  await syncDirectory(archive);
  const archiveBytes = await readPrivate(join(archive, 'manifest.json'), 16 * 1024 * 1024);
  check(JSON.parse(archiveBytes.toString()).source === target.environment);
  const plans: IdentityImportPlan[] = [];
  let planBytes = 0;
  // Observations remain provisional until the entire copied archive and references verify.
  const report = await verifyArchive(archive, (raw) => {
    check(plans.length < MAX_PLANS);
    const plan = mapIdentitySource(raw);
    planBytes += encode(plan).length;
    check(planBytes < MAX_PLAN_BYTES - 2);
    plans.push(plan);
  });
  check(Object.keys(report.findings).length === 0 && report.counts.users === plans.length);
  const encodedPlans = encode(plans);
  check(encodedPlans.length <= MAX_PLAN_BYTES);
  await writePrivate(join(directory, 'plans.json'), encodedPlans);
  const manifest = parseProfile(manifestSchema, {
    version: 1,
    kind: 'cartyx-identity-bulk-import',
    complete: true,
    batchId: randomUUID(),
    target,
    archiveManifestSha256: importBytesDigest(archiveBytes),
    plansSha256: importBytesDigest(encodedPlans),
    users: plans.length,
    campaigns: report.counts.campaigns,
  });
  await writePrivate(join(directory, 'manifest.pending'), encode(manifest));
  await syncDirectory(directory);
  await rename(join(directory, 'manifest.pending'), join(directory, 'manifest.json'));
  await syncDirectory(directory);
  await loadIdentityImportPackage(directory, target);
  return {
    users: manifest.users,
    archivedCampaigns: manifest.campaigns,
    cutoverReady: false as const,
  };
}

/** Verify all BSON, mapping, references, plans and binding BEFORE any database is touched. */
export async function loadIdentityImportPackage(
  directory: string,
  input: IdentityImportTarget
): Promise<IdentityImportPackage> {
  const target = parseIdentityImportTarget(input);
  await privateDirectory(directory);
  const manifestBytes = await readPrivate(join(directory, 'manifest.json'), 16384);
  const manifest = parseProfile(manifestSchema, JSON.parse(manifestBytes.toString()));
  check(isDeepStrictEqual(manifest.target, target));
  const planBytes = await readPrivate(join(directory, 'plans.json'), MAX_PLAN_BYTES);
  check(importBytesDigest(planBytes) === manifest.plansSha256);
  const inputPlans: unknown = JSON.parse(planBytes.toString());
  check(Array.isArray(inputPlans) && inputPlans.length === manifest.users);
  const plans = inputPlans.map(parseIdentityImportPlan);
  const archive = join(directory, 'archive');
  await privateDirectory(archive);
  const archiveBytes = await readPrivate(join(archive, 'manifest.json'), 16 * 1024 * 1024);
  check(importBytesDigest(archiveBytes) === manifest.archiveManifestSha256);
  check(JSON.parse(archiveBytes.toString()).source === target.environment);
  let index = 0;
  const report = await verifyArchive(archive, (raw) => {
    check(index < plans.length);
    verifyIdentityImportSource(raw, plans[index++]);
  });
  check(
    index === plans.length &&
      report.counts.users === manifest.users &&
      report.counts.campaigns === manifest.campaigns &&
      Object.keys(report.findings).length === 0
  );
  return { manifest, plans, digest: importBytesDigest(manifestBytes) };
}
