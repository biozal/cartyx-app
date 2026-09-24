import { readCqlConfig } from '../../app/server/db/cql/config';
import { runCqlSchema } from './schema';
const mode = process.argv[2];
if (mode !== 'apply' && mode !== 'verify') throw new Error('Usage: cql:schema -- apply|verify');
try {
  const result = await runCqlSchema(readCqlConfig('schema'), mode, process.env.CQL_MIGRATION_OWNER);
  process.stdout.write(`CQL schema ${result.version} verified (${result.checksum})\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'CQL schema failed'}\n`);
  process.exitCode = 1;
}
