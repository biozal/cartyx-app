import { z } from 'zod';
import { newStateRevision } from '../../app/server/db/cql/control-state';
import {
  parseProfile,
  profileOperationId,
  type ImmutableProfileStore,
} from '../../app/server/repositories/identity/profile-model';
import type { ReservationStateStore } from '../../app/server/repositories/identity/reservations';
import { createIdentityImporter } from './import-account';
import {
  loadIdentityImportPackage,
  parseIdentityImportTarget,
  type IdentityImportTarget,
} from './bulk-package';

export const identityBulkImportKey = (batchId: string) => ({
  scope: 'global',
  type: 'identity_bulk_import',
  id: parseProfile(profileOperationId, batchId),
});
const receiptSchema = z
  .object({
    version: z.literal(1),
    batchId: profileOperationId,
    digest: z.string().regex(/^[0-9a-f]{64}$/),
    status: z.enum(['prepared', 'applied']),
  })
  .strict();
export class IdentityBulkImportError extends Error {
  constructor(readonly batchId: string | null) {
    super('Identity bulk import requires private package verification or exact-plan recovery');
    this.name = 'IdentityBulkImportError';
  }
}

/**
 * Operator-only, quiescent target. Every call revalidates the complete private
 * package before any DB read/write. No source access, HTTP, rebase or automatic retry.
 */
export function createIdentityBulkImporter(
  state: ReservationStateStore,
  graph: ImmutableProfileStore,
  input: IdentityImportTarget
) {
  const target = parseIdentityImportTarget(input);
  const importer = createIdentityImporter(state, graph);
  async function run(directory: string, apply: boolean) {
    let batchId: string | null = null;
    try {
      const batch = await loadIdentityImportPackage(directory, target);
      batchId = batch.manifest.batchId;
      const key = identityBulkImportKey(batchId);
      const read = async () => {
        const row = await state.get(key);
        if (!row) return null;
        const value = parseProfile(receiptSchema, row.value);
        if (value.batchId !== batchId || value.digest !== batch.digest)
          throw new Error('Identity bulk import package changed');
        return { revision: row.revision, value };
      };
      let saved = await read();
      if (!saved && apply) {
        await state.create(key, newStateRevision(), {
          version: 1,
          batchId,
          digest: batch.digest,
          status: 'prepared',
        });
        saved = await read();
      }
      if (!saved || (!apply && saved.value.status !== 'applied'))
        throw new Error('Identity bulk import requires recovery');
      if (apply && saved.value.status === 'prepared') {
        for (const plan of batch.plans) await importer.apply(plan);
        const applied = await state.replace(key, saved.revision, newStateRevision(), {
          ...saved.value,
          status: 'applied',
        });
        if (!applied && (await read())?.value.status !== 'applied')
          throw new Error('Identity bulk import receipt did not settle');
      }
      // Terminal batch receipts never restore old data or substitute for current checks.
      for (const plan of batch.plans) await importer.verify(plan);
      return {
        users: batch.manifest.users,
        archivedCampaigns: batch.manifest.campaigns,
        cutoverReady: false as const,
      };
    } catch {
      throw new IdentityBulkImportError(batchId);
    }
  }
  return {
    apply: (directory: string) => run(directory, true),
    verify: (directory: string) => run(directory, false),
  };
}
