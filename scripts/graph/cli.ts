import { readGraphConfig } from '../../app/server/db/graph/config';
import { checkSchema } from './schema';
import { checkEntitySchema } from './entity-schema';

const mode = process.argv[2];
if (mode !== 'apply' && mode !== 'verify') throw new Error('Usage: graph:schema -- apply|verify');
try {
  const config = readGraphConfig();
  const result = await checkSchema(config, mode === 'apply');
  process.stdout.write(`Graph schema ${result.version} verified (${result.checksum})\n`);
  const entities = await checkEntitySchema(config, mode === 'apply');
  process.stdout.write(`Entity schema ${entities.version} verified (${entities.checksum})\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Graph schema check failed'}\n`);
  process.exitCode = 1;
}
