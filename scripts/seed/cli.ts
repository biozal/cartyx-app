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
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSeedTargetIsNotProduction } from './guards';
import { runSeeders, seeders } from './registry';
import { seedGameMaster } from './users';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const requested = process.argv[2];
if (requested !== 'seed' && requested !== 'clear')
  throw new Error('Usage: tsx scripts/seed/cli.ts seed|clear [--force]');
const action: 'seed' | 'clear' = requested;

assertSeedTargetIsNotProduction();

/** Subsystems still on MongoDB. Remove an entry when its slice moves to the graph. */
const MONGO_SUBSYSTEMS = [
  'users',
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
      // The game master's account is in the graph; the subsystems still on MongoDB need
      // its id to attach their campaigns to the same person the application sees.
      python('dev_seed.py', [], { CARTYX_SEED_GM_ID: await seedGameMaster() });
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
