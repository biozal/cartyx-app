/**
 * Wipe all campaign-related data from the dev database.
 *
 * Usage:
 *   npx tsx scripts/dev-clear.ts            # interactive confirmation
 *   npx tsx scripts/dev-clear.ts --force     # skip confirmation
 *
 * Shortcut:
 *   npm run dev:clear
 *   npm run dev:clear -- --force
 *
 * Safety: refuses to run if NODE_ENV is "production" or if the MONGODB_URI
 * contains "prod" anywhere in the string.
 */
import mongoose from 'mongoose';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Safety guard
// ---------------------------------------------------------------------------
function assertNotProduction(uri: string): void {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run in production.');
    process.exit(1);
  }
  if (/prod/i.test(uri)) {
    console.error('MONGODB_URI looks like a production connection string. Aborting.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Confirmation prompt
// ---------------------------------------------------------------------------
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

// ---------------------------------------------------------------------------
// Collections to wipe — everything tied to campaigns
// ---------------------------------------------------------------------------
const COLLECTIONS_TO_CLEAR = [
  'campaigns',
  'sessions',
  'characters',
  'players',
  'messages',
  'dicerolls',
  'notes',
  'races',
  'rules',
  'gmscreens',
  'tags',
] as const;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }

  assertNotProduction(uri);

  const force = process.argv.includes('--force');

  if (!force) {
    console.log('\nThis will DELETE all data from the following collections:');
    COLLECTIONS_TO_CLEAR.forEach((c) => console.log(`  - ${c}`));
    console.log(`\nTarget: ${uri.replace(/\/\/[^@]+@/, '//<credentials>@')}\n`);

    const ok = await confirm('Proceed?');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  await mongoose.connect(uri, { autoIndex: false });

  const db = mongoose.connection.db;
  if (!db) {
    console.error('Failed to get database handle.');
    process.exit(1);
  }

  const existing = (await db.listCollections().toArray()).map((c) => c.name);

  let totalDeleted = 0;
  for (const name of COLLECTIONS_TO_CLEAR) {
    if (!existing.includes(name)) {
      console.log(`  skip  ${name} (does not exist)`);
      continue;
    }
    const result = await db.collection(name).deleteMany({});
    totalDeleted += result.deletedCount;
    console.log(`  clear ${name} — ${result.deletedCount} documents removed`);
  }

  // Also clear campaign references from users (but don't delete users)
  const userResult = await db.collection('users').updateMany({}, { $set: { campaigns: [] } });
  console.log(`  patch users — cleared campaign refs from ${userResult.modifiedCount} user(s)`);

  // Clean up seed images from public/uploads/campaigns/
  const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads', 'campaigns');
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir).filter((f) => f.startsWith('seed-'));
    for (const file of files) {
      fs.unlinkSync(path.join(uploadsDir, file));
    }
    if (files.length > 0) {
      console.log(`  clean ${files.length} seed image(s) from public/uploads/campaigns/`);
    }
  }

  console.log(
    `\nDone. ${totalDeleted} documents deleted across ${COLLECTIONS_TO_CLEAR.length} collections.`
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exitCode = 1;
});
