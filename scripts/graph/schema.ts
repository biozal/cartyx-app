import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { GraphConnectionConfig } from '../../app/server/db/graph/config';
import { submitGraphRequest } from '../../app/server/db/graph/transport';

export async function checkSchema(config: GraphConnectionConfig, applySchema = false) {
  const script = readFileSync(new URL('./0001-foundation.groovy', import.meta.url), 'utf8');
  const checksum = createHash('sha256').update(script).digest('hex');
  const result = await submitGraphRequest(config, script, { applySchema, checksum });
  if (result[0] !== '0001:verified') throw new Error('Unexpected schema response');
  return { version: '0001', checksum };
}
