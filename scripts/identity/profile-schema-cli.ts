import { readGraphConfig } from '../../app/server/db/graph/config';
import { checkIdentityProfileSchema } from './profile-schema';
const mode = process.argv[2];
if (!['apply', 'verify'].includes(mode))
  throw new Error('Usage: identity:graph-schema -- apply|verify');
const result = await checkIdentityProfileSchema(readGraphConfig(), mode === 'apply');
process.stdout.write(`Identity profile schema ${result.version} verified (${result.checksum})\n`);
