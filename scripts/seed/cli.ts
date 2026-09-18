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

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const action = process.argv[2];
if (action !== 'seed' && action !== 'clear')
  throw new Error('Usage: tsx scripts/seed/cli.ts seed|clear [--force]');

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

const python = (script: string, args: string[] = []) =>
  execFileSync(process.execPath, [resolve(root, 'scripts/run-python.cjs'), script, ...args], {
    cwd: root,
    stdio: 'inherit',
  });

const ran = await runSeeders(seeders, action);
if (ran.length) process.stdout.write(`Graph ${action}: ${ran.join(', ')}\n`);

if (MONGO_SUBSYSTEMS.length) {
  if (action === 'clear') {
    // dev_clear keeps user accounts and empties everything else, including media.
    python('dev_clear.py', process.argv.includes('--force') ? ['--force'] : []);
  } else {
    python('dev_seed.py');
  }
  process.stdout.write(
    `MongoDB ${action} still covers: ${MONGO_SUBSYSTEMS.join(', ')}\n` +
      'Each entry disappears when its subsystem moves to the graph.\n'
  );
} else if (action === 'seed') {
  process.stdout.write('Every subsystem is seeded from the graph; MongoDB is no longer used.\n');
}
