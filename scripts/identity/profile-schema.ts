import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { GraphConnectionConfig } from '../../app/server/db/graph/config';
import { submitGraphRequest } from '../../app/server/db/graph/transport';
import { checkSchema } from '../graph/schema';
export async function checkIdentityProfileSchema(
  config: GraphConnectionConfig,
  applySchema = false
) {
  await checkSchema(config); // Existing composite indexes must be enabled and verified first.
  const script = readFileSync(new URL('./0001-profile-schema.groovy', import.meta.url), 'utf8');
  const checksum = createHash('sha256').update(script).digest('hex');
  const result = await submitGraphRequest(config, script, { checksum, applySchema });
  if (result[0] !== 'identity-profiles:0001:verified')
    throw new Error('Unexpected profile schema result');
  // Additional read-only lifecycle audit; do not rewrite an applied DDL checksum.
  const lifecycle = await submitGraphRequest(
    config,
    `
    def m = graph.openManagement()
    try {
      def names = ['identityProfileDigest', 'identityProfileFirstName', 'identityProfileLastName',
        'identityProfileAvatarUrl', 'identityProfileRole', 'identityProfileRulerColor',
        'identityProfileCreatedAt', 'identityProfileLastLoginAt']
      def types = names.collect { m.getPropertyKey(it) } +
        [m.getVertexLabel('User'), m.getVertexLabel('UserProfileRevision'), m.getEdgeLabel('HAS_PROFILE_REVISION')]
      if (!types.every { m.getTTL(it).isZero() }) throw new IllegalStateException('Profile schema TTL drift')
      return 'identity-profiles:no-ttl'
    } finally { m.rollback() }
  `
  );
  if (lifecycle[0] !== 'identity-profiles:no-ttl')
    throw new Error('Unexpected profile lifecycle result');
  return { version: '0001', checksum };
}
