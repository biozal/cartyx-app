/**
 * Playwright globalTeardown — runs once after all specs.
 *
 * Deletes exactly one thing: the storage-quota fillers `globalSetup.ts` upserts
 * for `audio-hardening.spec.ts` (see `AUDIO_QUOTA_FIXTURE` in
 * `e2e/fixtures/audio-fixtures.ts`).
 *
 * Every other fixture this suite seeds is additive — an extra image on a
 * location, extra audio rows, a tabletop screen — and leaving it behind costs
 * a developer nothing. These rows are different in kind: locally the suite runs
 * against the developer's own dev graph, and while they exist the seeded GM is
 * over the storage quota, so `/audio` refuses EVERY upload with a message that
 * gives no hint the E2E suite is why. Cleaning them up is what keeps "I ran
 * the E2E suite once" from silently disabling a feature.
 *
 * Deletion is keyed on `sourceKey`, not owner or title: the prefix is
 * E2E-specific, so this cannot reach a row the fixture didn't create, and it
 * still catches rows left by an older run whose GM lookup would resolve
 * differently.
 *
 * Failures are NOT swallowed — they propagate exactly as `globalSetup.ts`'s do.
 * A silent catch here would restore the precise situation this file exists to
 * prevent (fillers left behind, uploads refused, no explanation) while
 * reporting a green run. An interrupted run (Ctrl+C) skips this file entirely
 * regardless; the next `globalSetup` re-upserts the same three rows either way,
 * so nothing accumulates.
 */
import { AUDIO_QUOTA_FIXTURE } from './fixtures/audio-fixtures';
import { graphDb } from '../scripts/graph-db';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default async function globalTeardown(): Promise<void> {
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env optional in CI when vars are set in the environment
  }

  // Without a graph URL `globalSetup` could not have seeded anything, so
  // there is nothing here to remove.
  if (!process.env.GREMLIN_URL) return;
  // Same guard as globalSetup — it matters more here: this file issues a delete.
  if (/prod/i.test(process.env.GREMLIN_URL)) {
    throw new Error('Refusing to use a production-looking GREMLIN_URL');
  }

  const { closeData } = await import('../app/server/db/data-runtime');
  try {
    await graphDb()
      .collection('audioassets')
      .deleteMany({
        // `sourceKey` is not an indexed slot, so this filters in process over
        // the collection. Acceptable for a teardown against a test database.
        sourceKey: { $regex: `^${escapeRegExp(AUDIO_QUOTA_FIXTURE.sourceKeyPrefix)}` },
      });
  } finally {
    await closeData();
  }
}
