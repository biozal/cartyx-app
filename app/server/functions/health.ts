import { connectDB } from '../db/connection';
import { withLogging } from '../utils/logger';

/**
 * Circuit-breaker recovery probe. Must reflect real backend health: a probe that
 * skipped the data stores would close the breaker while every data-dependent endpoint
 * still fails, causing open/close flapping. It probes the graph and CQL both, and
 * fails with a 503 "Database not connected" (matched by the client-side classifier,
 * since the status does not survive server-fn serialization).
 */
export const healthCheck = withLogging('health.healthCheck', async (): Promise<{ ok: true }> => {
  await connectDB();
  const { requireDataAvailable } = await import('../db/data-runtime');
  await requireDataAvailable();
  return { ok: true };
});
