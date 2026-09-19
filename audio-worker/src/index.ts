import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';
import { claimNext, reapStale } from './claim.js';
import { readWorkerTimings } from './config.js';
import { processAsset, makeSourceDeleter } from './process.js';
import { beat } from './heartbeat.js';
import { captureException } from './telemetry.js';
import { openAudioAssets } from './store.js';

const WORKER_ID = `worker-${randomUUID().slice(0, 8)}`;
// Parsed in config.ts, not inline here: this module calls main() at import
// time, so anything read inline is untestable — and the naive
// `Number(process.env.X ?? default)` silently yields 0 for the empty string
// Helm renders for a missing values.yaml key. See envMs.
const { pollMs: POLL_MS, staleMs: STALE_MS, uploadStaleMs: UPLOAD_STALE_MS } = readWorkerTimings();

let running = true;
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, finishing current job');
  running = false;
});

async function main(): Promise<void> {
  // Before the store opens, not after: the liveness probe treats a missing
  // heartbeat as dead, and a store that never becomes reachable is itself a
  // wedge worth restarting. Writing it here means the probe's clock starts at
  // process start rather than at first success.
  beat();
  const { model, close } = await openAudioAssets();
  logger.info({ workerId: WORKER_ID }, 'audio worker started');

  // The reaper needs to delete the R2 objects of uploads abandoned before
  // confirm — see reapStale. Built here because process.ts owns the R2 client.
  const deleteSource = makeSourceDeleter();

  while (running) {
    try {
      beat();
      // `() => running` and not `running`: reapStale reads it between rows, so
      // a SIGTERM arriving mid-batch stops the reap at the next row instead of
      // running the whole batch out and waiting for the 900 s grace period to
      // end in a SIGKILL.
      await reapStale(model, STALE_MS, UPLOAD_STALE_MS, deleteSource, () => running);
      const asset = await claimNext<{
        _id: unknown;
        sourceKey?: string;
        // Task 18: carried through so `processAsset` can see them — the
        // real claimed document already has them (this is only a TS
        // annotation of what claimNext returns, not a projection), but
        // without naming them here the type at this call site would hide
        // them from readers even though processAsset's own param type
        // declares and uses both.
        onceSourceKey?: string;
        variant?: 'main' | 'once';
        attempts?: number;
      }>(model, WORKER_ID);
      if (!asset) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        continue;
      }
      await processAsset(model, asset, WORKER_ID);
    } catch (err) {
      logger.error({ err }, 'worker loop error');
      captureException(err, { workerId: WORKER_ID, scope: 'loop' });
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  await close();
  logger.info('audio worker stopped');
}

main().catch((err) => {
  logger.error({ err }, 'fatal');
  captureException(err, { workerId: WORKER_ID, scope: 'fatal' });
  // A beat of grace for the report to leave the process — the POST is
  // fire-and-forget, and process.exit would otherwise discard it.
  // (Not unref'd: unref would let the process fall out of the event loop and
  // exit 0, reporting a fatal crash to Kubernetes as a clean shutdown.)
  setTimeout(() => process.exit(1), 500);
});
