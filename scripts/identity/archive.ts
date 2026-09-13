import { constants } from 'node:fs';
import { mkdir, mkdtemp, open, lstat, chmod, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import mongoose from 'mongoose';
import { COLLECTIONS, IdentityAudit, type CollectionName } from './audit';

const MAX_DOCUMENT = 16 * 1024 * 1024;
const MAX_COLLECTION = 1024 * 1024 * 1024;
const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const encode = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
function check(condition: unknown): asserts condition {
  if (!condition) throw new Error('Invalid identity archive');
}

async function privateRead(path: string) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    check(stat.isFile() && (stat.mode & 0o077) === 0 && stat.uid === process.getuid?.());
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function readSmall(path: string) {
  const file = await privateRead(path);
  try {
    check((await file.stat()).size <= MAX_DOCUMENT);
    return await file.readFile();
  } finally {
    await file.close();
  }
}

async function writePrivate(path: string, data: Buffer) {
  const file = await open(path, 'wx', 0o600);
  try {
    await file.writeFile(data);
    await file.sync();
  } finally {
    await file.close();
  }
}

async function inspect(path: string, collection: CollectionName, audit: IdentityAudit) {
  const file = await privateRead(path);
  let bytes = 0;
  let count = 0;
  const hash = createHash('sha256');
  try {
    const size = (await file.stat()).size;
    check(size <= MAX_COLLECTION);
    const readExactly = async (buffer: Buffer, position: number) => {
      let offset = 0;
      while (offset < buffer.length) {
        const result = await file.read(buffer, offset, buffer.length - offset, position + offset);
        check(result.bytesRead > 0);
        offset += result.bytesRead;
      }
    };
    while (bytes < size) {
      check(size - bytes >= 4);
      const prefix = Buffer.alloc(4);
      await readExactly(prefix, bytes);
      const length = prefix.readInt32LE(0);
      check(length >= 5 && length <= MAX_DOCUMENT && length <= size - bytes);
      const raw = Buffer.alloc(length);
      await readExactly(raw, bytes);
      check(raw[length - 1] === 0);
      audit.add(collection, raw); // Full BSON validation, not just a valid frame length.
      hash.update(raw);
      count++;
      bytes += length;
    }
    check((await file.stat()).size === size);
    return { file: `${collection}.bson`, count, bytes, sha256: hash.digest('hex') };
  } finally {
    await file.close();
  }
}

/** Private, read-only verification. Hashes detect corruption, not malicious replacement. */
export async function verifyArchive(directory: string) {
  const stat = await lstat(directory);
  check(stat.isDirectory() && (stat.mode & 0o077) === 0 && stat.uid === process.getuid?.());
  const manifest = JSON.parse((await readSmall(join(directory, 'manifest.json'))).toString());
  check(
    manifest.version === 1 &&
      manifest.kind === 'cartyx-identity-preflight' &&
      manifest.complete === true
  );
  check(['dev', 'prod', 'local'].includes(manifest.source));
  const uint32 = (value: unknown) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  check(
    manifest.snapshot &&
      uint32(manifest.snapshot.$timestamp?.t) &&
      uint32(manifest.snapshot.$timestamp?.i)
  );
  check(manifest.catalogConsistency === 'live-before-and-after-not-snapshot');
  const audit = new IdentityAudit();
  // Paths are fixed by this format; never resolve paths supplied in a manifest.
  const collections = [];
  for (const name of COLLECTIONS)
    collections.push(await inspect(join(directory, `${name}.bson`), name, audit));
  check(isDeepStrictEqual(manifest.collections, collections));
  for (const name of ['catalog', 'audit'] as const) {
    const raw = await readSmall(join(directory, `${name}.json`));
    check(
      isDeepStrictEqual(manifest[name], {
        file: `${name}.json`,
        bytes: raw.length,
        sha256: sha256(raw),
      })
    );
    const value = JSON.parse(raw.toString());
    if (name === 'audit') check(isDeepStrictEqual(value, audit.finish()));
    else check(isDeepStrictEqual(Object.keys(value).sort(), [...COLLECTIONS].sort()));
  }
  return audit.finish();
}

async function privateRoot(root: string) {
  // Do not follow symlinks in the fixed export tree. Tighten existing directories.
  let path = resolve(root);
  const rootStat = await lstat(path);
  check(rootStat.isDirectory() && rootStat.uid === process.getuid?.());
  for (const part of ['.local', 'data', 'identity']) {
    path = join(path, part);
    await mkdir(path, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
    });
    const stat = await lstat(path);
    check(stat.isDirectory() && stat.uid === process.getuid?.());
    await chmod(path, 0o700);
  }
  return path;
}

export async function exportIdentity(options: {
  uri: string;
  database?: string;
  source: 'local' | 'dev' | 'prod';
  root: string;
}) {
  check(['local', 'dev', 'prod'].includes(options.source));
  const directory = await mkdtemp(join(await privateRoot(options.root), `${options.source}-`));
  const client = new mongoose.mongo.MongoClient(options.uri, {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    socketTimeoutMS: 30_000,
    retryReads: false,
    retryWrites: false,
    readPreference: 'primary',
    monitorCommands: true,
  });
  // Read the server-selected timestamp from the public command monitoring API;
  // the driver's session.snapshotTime implementation is not a public API.
  let snapshot: unknown;
  client.on('commandSucceeded', (event) => {
    if (event.commandName === 'find' && snapshot === undefined) {
      const reply = event.reply as {
        cursor?: { atClusterTime?: unknown };
        atClusterTime?: unknown;
      };
      snapshot = reply.cursor?.atClusterTime ?? reply.atClusterTime;
    }
  });
  const session = client.startSession({ snapshot: true, causalConsistency: false });
  try {
    await client.connect();
    const db = client.db(options.database);
    // Catalog commands cannot use snapshot read concern. Capture separately and
    // refuse observed drift; this does not detect a change-and-revert during export.
    const catalog = async () => {
      const result: Record<string, unknown> = {};
      for (const name of COLLECTIONS) {
        const entries = await db.listCollections({ name }, { nameOnly: false }).toArray();
        check(entries.length === 1 && entries[0].type === 'collection');
        result[name] = {
          collection: entries[0],
          indexes: await db.collection(name).listIndexes().toArray(),
        };
      }
      return mongoose.mongo.BSON.EJSON.serialize(result, { relaxed: false });
    };
    const before = await catalog();
    const audit = new IdentityAudit();
    const collections = [];
    for (const name of COLLECTIONS) {
      const file = await open(join(directory, `${name}.bson`), 'wx', 0o600);
      const hash = createHash('sha256');
      let count = 0;
      let bytes = 0;
      const cursor = db.collection(name).find(
        {},
        {
          raw: true,
          session,
          batchSize: 100,
          maxTimeMS: 30_000,
          allowPartialResults: false,
        }
      );
      try {
        for await (const raw of cursor) {
          check(
            Buffer.isBuffer(raw) &&
              raw.length >= 5 &&
              raw.length <= MAX_DOCUMENT &&
              raw.readInt32LE(0) === raw.length
          );
          bytes += raw.length;
          check(bytes <= MAX_COLLECTION);
          audit.add(name, raw);
          await file.writeFile(raw);
          hash.update(raw);
          count++;
        }
        await file.sync();
      } finally {
        try {
          await cursor.close();
        } finally {
          await file.close();
        }
      }
      check(
        count === (await db.collection(name).countDocuments({}, { session, maxTimeMS: 30_000 }))
      );
      collections.push({ file: `${name}.bson`, count, bytes, sha256: hash.digest('hex') });
    }
    check(snapshot instanceof mongoose.mongo.BSON.Timestamp);
    check(isDeepStrictEqual(before, await catalog()));
    const manifest = {
      version: 1,
      kind: 'cartyx-identity-preflight',
      complete: true,
      source: options.source,
      database: db.databaseName,
      capturedAt: new Date().toISOString(),
      snapshot: mongoose.mongo.BSON.EJSON.serialize(snapshot, { relaxed: false }),
      catalogConsistency: 'live-before-and-after-not-snapshot',
      collections,
      catalog: {},
      audit: {},
    };
    for (const [name, value] of [
      ['catalog', before],
      ['audit', audit.finish()],
    ] as const) {
      const raw = encode(value);
      await writePrivate(join(directory, `${name}.json`), raw);
      manifest[name] = { file: `${name}.json`, bytes: raw.length, sha256: sha256(raw) };
    }
    // Publish the completion marker last. A failed/interrupted export has no valid
    // manifest and must never be consumed or resumed as a complete snapshot.
    await writePrivate(join(directory, 'manifest.pending'), encode(manifest));
    await rename(join(directory, 'manifest.pending'), join(directory, 'manifest.json'));
    const report = await verifyArchive(directory);
    return { directory, report };
  } finally {
    try {
      await session.endSession();
    } finally {
      await client.close();
    }
  }
}
