import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { GraphConnectionConfig } from '../../app/server/db/graph/config';
import { submitGraphRequest } from '../../app/server/db/graph/transport';
import { checkSchema } from './schema';

const SLOTS = [
  ...Array.from({ length: 8 }, (_item, index) => `ix_s${index + 1}`),
  ...Array.from({ length: 4 }, (_item, index) => `ix_n${index + 1}`),
  ...Array.from({ length: 4 }, (_item, index) => `ix_b${index + 1}`),
  ...Array.from({ length: 2 }, (_item, index) => `ix_d${index + 1}`),
];

/** Must match the index set the migration knows about. */
export const ENTITY_INDEXES = [
  'byScopeKind',
  'byEntityText',
  ...SLOTS.map((slot) => `byScopeKind_${slot}`),
];

const VERSION = '0001';

/**
 * Operator-only. Runs one bounded request per step: creating every index at once
 * outruns the server's evaluation timeout on an empty graph.
 */
export async function checkEntitySchema(config: GraphConnectionConfig, applySchema = false) {
  await checkSchema(config); // The foundation identity index must exist and be ENABLED first.
  const script = readFileSync(new URL('./0002-entities.groovy', import.meta.url), 'utf8');
  const checksum = createHash('sha256').update(script).digest('hex');
  const bindings = { checksum, applySchema, version: VERSION };

  const expect = async (step: string, outcome: string, extra: Record<string, string> = {}) => {
    const result = await submitGraphRequest(config, script, { ...bindings, step, ...extra });
    if (result[0] !== outcome) throw new Error(`Unexpected entity schema result for ${step}`);
  };

  const status = async (indexName: string) => {
    const result = await submitGraphRequest(config, script, {
      ...bindings,
      step: 'index-status',
      indexName,
    });
    return String(result[0]).replace('entities:index-status:', '');
  };
  const settle = async (indexName: string, wanted: string[], deadlineMs = 120_000) => {
    const deadline = Date.now() + deadlineMs;
    for (;;) {
      const current = await status(indexName);
      if (wanted.includes(current)) return current;
      if (Date.now() > deadline)
        throw new Error(`Index ${indexName} stayed ${current}, expected ${wanted.join(' or ')}`);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  };

  await expect('properties', 'entities:properties');
  await expect('labels', 'entities:labels');
  for (const indexName of ENTITY_INDEXES) {
    await expect('index-create', `entities:index-create:${indexName}`, { indexName });
    if (!applySchema) {
      if ((await status(indexName)) !== 'ENABLED')
        throw new Error(`Index ${indexName} is not ENABLED`);
      continue;
    }
    // Registration waits for every graph instance to acknowledge the new index.
    const settled = await settle(indexName, ['REGISTERED', 'ENABLED']);
    if (settled === 'REGISTERED') {
      await expect('index-enable', `entities:index-enable:${indexName}`, { indexName });
      await settle(indexName, ['ENABLED']);
    }
  }
  await expect('record', `entities:${VERSION}:verified`);
  return { version: VERSION, checksum };
}
