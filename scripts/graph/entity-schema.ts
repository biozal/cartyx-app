import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { GraphConnectionConfig } from '../../app/server/db/graph/config';
import { submitGraphRequest } from '../../app/server/db/graph/transport';
import { checkSchema } from './schema';

/** Operator-only. Runtime credentials cannot read or write the schema registry. */
export async function checkEntitySchema(config: GraphConnectionConfig, applySchema = false) {
  await checkSchema(config); // The foundation identity index must exist and be ENABLED first.
  const script = readFileSync(new URL('./0002-entities.groovy', import.meta.url), 'utf8');
  const checksum = createHash('sha256').update(script).digest('hex');
  const result = await submitGraphRequest(config, script, { checksum, applySchema });
  if (result[0] !== 'entities:0001:verified') throw new Error('Unexpected entity schema result');
  const lifecycle = await submitGraphRequest(
    config,
    `
    def m = graph.openManagement()
    try {
      def names = ['doc', 'docVersion', 'revision', 'createdAt', 'updatedAt', 'searchWord', 'position']
      def keys = names.collect { m.getPropertyKey(it) }
      if (keys.any { it == null }) throw new IllegalStateException('Entity property missing')
      if (!keys.every { m.getTTL(it).isZero() }) throw new IllegalStateException('Entity schema TTL drift')
      return 'entities:no-ttl'
    } finally { m.rollback() }
  `
  );
  if (lifecycle[0] !== 'entities:no-ttl') throw new Error('Unexpected entity lifecycle result');
  return { version: '0001', checksum };
}
