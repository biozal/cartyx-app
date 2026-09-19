/**
 * Rebuilds a test environment's data. Cartyx migrates one subsystem at a time, so this
 * runs the graph seeders that exist and delegates the rest to the MongoDB scripts until
 * their slice lands; those delegations disappear as each subsystem moves.
 *
 * Usage: tsx scripts/seed/cli.ts seed|clear [--force]
 *
 * Reset means clear THEN seed, in that order. Seeding alone accumulates.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSeedTargetIsNotProduction } from './guards';
import { persistPlan, readPlan } from './plan';
import { runSeeders, seeders } from './registry';
import { seedGameMaster, seedPlayers } from './users';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const requested = process.argv[2];
if (requested !== 'seed' && requested !== 'clear')
  throw new Error('Usage: tsx scripts/seed/cli.ts seed|clear [--force]');
const action: 'seed' | 'clear' = requested;

assertSeedTargetIsNotProduction();

/** Subsystems still on MongoDB. Remove an entry when its slice moves to the graph. */
const MONGO_SUBSYSTEMS = [
  'campaigns',
  'locations',
  'characters',
  'players',
  'sessions',
  'notes',
  'organizations',
  'calendars',
  'events',
  'lore',
  'quests',
  'srd',
  'maps',
  'gmscreens',
  'tabletop',
  'chat',
  'audio',
];

const python = (script: string, args: string[] = [], env: Record<string, string> = {}) =>
  execFileSync(process.execPath, [resolve(root, 'scripts/run-python.cjs'), script, ...args], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });

async function rebuild() {
  const ran = await runSeeders(seeders, action);
  if (ran.length) process.stdout.write(`Graph ${action}: ${ran.join(', ')}\n`);

  if (MONGO_SUBSYSTEMS.length) {
    if (action === 'clear') {
      // dev_clear keeps user accounts and empties everything else, including media.
      python('dev_clear.py', process.argv.includes('--force') ? ['--force'] : []);
    } else {
      // The Python builder produces every document with its id assigned and writes them
      // to a plan; this process persists the plan, sending each collection to the graph
      // or to MongoDB. Accounts are already in the graph, so their ids are passed in.
      const planDir = mkdtempSync(join(tmpdir(), 'cartyx-seed-'));
      const planPath = join(planDir, 'plan.json');
      try {
        python('dev_seed.py', [], {
          CARTYX_SEED_GM_ID: await seedGameMaster(),
          CARTYX_SEED_PLAYERS: JSON.stringify(await seedPlayers()),
          CARTYX_SEED_PLAN: planPath,
        });
        const summary = await persistPlan(readPlan(planPath));
        const line = (counts: Record<string, number>) =>
          Object.entries(counts)
            .map(([name, count]) => `${name} ${count}`)
            .join(', ') || 'nothing';
        process.stdout.write(`Seed persisted — graph: ${line(summary.graph)}
`);
        process.stdout.write(`Seed persisted — MongoDB: ${line(summary.mongo)}
`);
      } finally {
        rmSync(planDir, { recursive: true, force: true });
      }
    }
    process.stdout.write(
      `MongoDB ${action} still covers: ${MONGO_SUBSYSTEMS.join(', ')}\n` +
        'Each entry disappears when its subsystem moves to the graph.\n'
    );
  } else if (action === 'seed') {
    process.stdout.write('Every subsystem is seeded from the graph; MongoDB is no longer used.\n');
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
