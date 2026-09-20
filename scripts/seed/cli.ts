/**
 * Rebuilds a test environment's data in the graph. Accounts are seeded here; the rest
 * of the world is built by the Python seed builder as a plan, which this process
 * persists. Clearing empties every graph collection and the media stores, and keeps
 * accounts so you stay logged in.
 *
 * Usage: tsx scripts/seed/cli.ts seed|clear [--force]
 *
 * Reset means clear THEN seed, in that order. Seeding alone accumulates.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSeedTargetIsNotProduction } from './guards';
import { clearGraphCollections, graphCollectionRoutes } from './graph-collections';
import { persistPlan, readPlan } from './plan';
import { runSeeders, seeders } from './registry';
import { seedGameMaster, seedPlayers } from './users';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// Local runs keep the data settings in .env; CI passes them in the environment, which
// keeps precedence (Node does not overwrite what is already set).
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));
const requested = process.argv[2];
if (requested !== 'seed' && requested !== 'clear')
  throw new Error('Usage: tsx scripts/seed/cli.ts seed|clear [--force]');
const action: 'seed' | 'clear' = requested;

assertSeedTargetIsNotProduction();

const python = (script: string, args: string[] = [], env: Record<string, string> = {}) =>
  execFileSync(process.execPath, [resolve(root, 'scripts/run-python.cjs'), script, ...args], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });

async function rebuild() {
  const ran = await runSeeders(seeders, action);
  if (ran.length) process.stdout.write(`Graph ${action}: ${ran.join(', ')}\n`);

  if (action === 'clear') {
    // dev_clear empties the media stores (local uploads and R2); the graph is emptied here.
    python('dev_clear.py', process.argv.includes('--force') ? ['--force'] : []);
    const removed = await clearGraphCollections();
    process.stdout.write(
      `Graph clear: ${Object.entries(removed)
        .map(([name, count]) => `${name} ${count}`)
        .join(', ')}\n`
    );
    return;
  }
  // The Python builder produces every document with its id assigned and writes them to a
  // plan; this process persists it. Accounts are already in the graph, so their ids are
  // passed in.
  const planDir = mkdtempSync(join(tmpdir(), 'cartyx-seed-'));
  const planPath = join(planDir, 'plan.json');
  try {
    python('dev_seed.py', [], {
      CARTYX_SEED_GM_ID: await seedGameMaster(),
      CARTYX_SEED_PLAYERS: JSON.stringify(await seedPlayers()),
      CARTYX_SEED_PLAN: planPath,
    });
    const summary = await persistPlan(readPlan(planPath), graphCollectionRoutes);
    process.stdout.write(
      `Seed persisted: ${Object.entries(summary)
        .map(([name, count]) => `${name} ${count}`)
        .join(', ')}\n`
    );
  } finally {
    rmSync(planDir, { recursive: true, force: true });
  }
}

// The database driver keeps the event loop alive, so a command that has finished its
// work has to release it or it sits there looking like it hung. CI found this the
// expensive way: a seed step that had already done everything ran for six hours before
// the runner killed it.
let failure: unknown;
try {
  await rebuild();
} catch (error) {
  failure = error;
}
const { closeData } = await import('../../app/server/db/data-runtime');
await closeData();
if (failure) throw failure;
