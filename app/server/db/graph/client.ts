import gremlin from 'gremlin';
import type { GraphConnectionConfig } from './config';
import { submitGraphRequest } from './transport';

/** Low-level server boundary, not an authorization layer or a browser query API. */
export function createGraphClient(config: GraphConnectionConfig) {
  return {
    async execute(
      traversal: gremlin.process.GraphTraversal,
      signal?: AbortSignal
    ): Promise<unknown[]> {
      const bytecode = traversal.getBytecode();
      if (!(bytecode instanceof gremlin.process.Bytecode))
        throw new Error('Expected Gremlin bytecode');
      return submitGraphRequest(config, bytecode, {}, signal);
    },
  };
}
