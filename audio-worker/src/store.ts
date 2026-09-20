import { graphCollection } from '../../app/server/db/graph-driver';
import { AudioAsset } from '../../app/server/db/models/AudioAsset';
import type { ClaimModel } from './claim.js';
import type { Model } from './process.js';

/**
 * The audio assets the worker claims and transcodes, in the graph.
 *
 * The worker was written against the MongoDB driver's collection, and it still is:
 * `graphCollection` answers the same findOneAndUpdate/updateOne/updateMany/find calls
 * through the app's own AudioAsset model, so the worker and the web app write one
 * schema. A claim is a compare-and-set that re-checks its filter against the version
 * it writes, so two workers can never take the same row.
 */
export async function openAudioAssets(): Promise<{
  model: ClaimModel & Model;
  close: () => Promise<void>;
}> {
  if (!process.env.GREMLIN_URL) throw new Error('GREMLIN_URL is required');
  const { closeData } = await import('../../app/server/db/data-runtime');
  return {
    model: graphCollection(AudioAsset) as unknown as ClaimModel & Model,
    close: closeData,
  };
}
