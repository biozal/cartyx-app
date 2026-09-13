import { readCqlConfig } from '../../app/server/db/cql/config';
import { createControlStateStore } from '../../app/server/db/cql/control-state';
import { readGraphConfig } from '../../app/server/db/graph/config';
import { createGraphClient } from '../../app/server/db/graph/client';
import { createGraphProfileStore } from '../../app/server/repositories/identity/graph-profiles';
import { createIdentityBulkImporter } from './bulk-import';
import {
  identityImportTarget,
  loadIdentityImportPackage,
  prepareIdentityImportPackage,
} from './bulk-package';
import { checkIdentityProfileSchema } from './profile-schema';

try {
  const [mode, environment, directory, destination, ...extra] = process.argv.slice(2);
  if (
    !['prepare', 'check', 'apply', 'verify'].includes(mode) ||
    !['local', 'dev', 'prod'].includes(environment) ||
    !directory ||
    extra.length ||
    (mode === 'prepare' ? !destination : destination !== undefined)
  )
    throw new Error('Invalid bulk command');
  const cql = readCqlConfig('runtime');
  const graph = readGraphConfig();
  const target = identityImportTarget(environment as 'local' | 'dev' | 'prod', cql, graph);
  if (mode === 'prepare') {
    console.log(JSON.stringify(await prepareIdentityImportPackage(directory, destination, target)));
  } else {
    // Invalid packages/environment never cause a connection or target schema read.
    const batch = await loadIdentityImportPackage(directory, target);
    if (mode === 'check') {
      console.log(
        JSON.stringify({
          users: batch.manifest.users,
          archivedCampaigns: batch.manifest.campaigns,
          cutoverReady: false,
        })
      );
    } else {
      // Explicit operator attestation, not a backend flag or proof of writer quiescence.
      if (process.env.IDENTITY_IMPORT_MAINTENANCE !== 'confirmed')
        throw new Error('Quiescent target required');
      await checkIdentityProfileSchema(graph);
      const state = createControlStateStore(cql);
      try {
        const runner = createIdentityBulkImporter(
          state,
          createGraphProfileStore(createGraphClient(graph)),
          target
        );
        console.log(JSON.stringify(await runner[mode === 'apply' ? 'apply' : 'verify'](directory)));
      } finally {
        await state.close();
      }
    }
  }
} catch {
  // Source values, IDs, config, envelopes and driver causes never enter ordinary logs.
  console.error(
    'Identity bulk import stopped. Check the private package, target binding, maintenance state and recovery runbook. No automatic retry was made.'
  );
  process.exitCode = 1;
}
