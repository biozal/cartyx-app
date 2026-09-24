import cassandra from 'cassandra-driver';
import type { CqlConfig } from './config';

export class CqlRequestError extends Error {
  constructor() {
    super(
      'CQL request failed; a submitted mutation may have committed. Read its revision before retrying.'
    );
    this.name = 'CqlRequestError';
  }
}

/** Server-only connection. Fixed statements belong to repositories and operator migrations. */
export function createCqlClient(config: CqlConfig) {
  const driver = new cassandra.Client({
    contactPoints: [config.contactPoint],
    localDataCenter: config.datacenter,
    keyspace: config.keyspace,
    authProvider: new cassandra.auth.PlainTextAuthProvider(config.username, config.password),
    sslOptions: {
      ca: config.ca,
      rejectUnauthorized: true,
      servername: config.servername,
      minVersion: 'TLSv1.2',
    },
    protocolOptions: { port: config.port, maxVersion: 4 },
    socketOptions: { connectTimeout: config.timeoutMs, readTimeout: config.timeoutMs },
    policies: {
      retry: new cassandra.policies.retry.FallthroughRetryPolicy(),
      speculativeExecution:
        new cassandra.policies.speculativeExecution.NoSpeculativeExecutionPolicy(),
    },
    queryOptions: {
      prepare: true,
      consistency: cassandra.types.consistencies.localQuorum,
      serialConsistency: cassandra.types.consistencies.localSerial,
      isIdempotent: false,
      fetchSize: 100,
    },
  });
  return {
    async execute(
      query: string,
      params: unknown[] = [],
      options: { ddl?: boolean; serialRead?: boolean } = {}
    ) {
      try {
        return await driver.execute(query, params, {
          prepare: !options.ddl,
          consistency: options.serialRead
            ? cassandra.types.consistencies.localSerial
            : cassandra.types.consistencies.localQuorum,
        });
      } catch {
        throw new CqlRequestError();
      }
    },
    async close() {
      await driver.shutdown();
    },
  };
}
export type CqlClient = ReturnType<typeof createCqlClient>;
