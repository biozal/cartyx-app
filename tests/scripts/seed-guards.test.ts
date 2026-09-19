// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assertSeedTargetIsNotProduction } from '../../scripts/seed/guards';

const safe = {
  NODE_ENV: 'development',
  GREMLIN_URL: 'wss://localhost:18182/gremlin',
  CQL_STATE_KEYSPACE: 'cartyx_state',
  CQL_CONTACT_POINT: '127.0.0.1',
  R2_BUCKET: 'cartyx-dev',
};

describe('seed target guards', () => {
  it('accepts a local or dev target', () => {
    expect(() => assertSeedTargetIsNotProduction(safe)).not.toThrow();
    expect(() =>
      assertSeedTargetIsNotProduction({
        ...safe,
        CQL_STATE_KEYSPACE: 'cartyx_dev_state',
        CQL_CONTACT_POINT: 'cartyx-data-cassandra.dev.svc',
      })
    ).not.toThrow();
  });

  it('refuses production by NODE_ENV', () => {
    expect(() => assertSeedTargetIsNotProduction({ ...safe, NODE_ENV: 'production' })).toThrow(
      /production/i
    );
  });

  it('refuses a target that names prod anywhere', () => {
    for (const override of [
      { GREMLIN_URL: 'wss://cartyx-data-janusgraph.prod.svc:8182/gremlin' },
      { CQL_STATE_KEYSPACE: 'cartyx_prod_state' },
      { CQL_CONTACT_POINT: 'cartyx-data-cassandra.prod.svc' },
      { R2_BUCKET: 'cartyx-prod-media' },
    ])
      expect(() => assertSeedTargetIsNotProduction({ ...safe, ...override })).toThrow(/prod/i);
  });

  it('refuses an incomplete target rather than guessing', () => {
    const { GREMLIN_URL: _url, ...withoutGraph } = safe;
    expect(() => assertSeedTargetIsNotProduction(withoutGraph)).toThrow(/GREMLIN_URL/);
    const { CQL_STATE_KEYSPACE: _keyspace, ...withoutKeyspace } = safe;
    expect(() => assertSeedTargetIsNotProduction(withoutKeyspace)).toThrow(/CQL_STATE_KEYSPACE/);
  });

  it('allows an absent media bucket, since seeding does not require one', () => {
    const { R2_BUCKET: _bucket, ...withoutBucket } = safe;
    expect(() => assertSeedTargetIsNotProduction(withoutBucket)).not.toThrow();
  });
});
