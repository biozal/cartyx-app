import { DataUnavailableError } from '../../db/data-unavailable';
import { GraphRequestError } from '../../db/graph/transport';
import type { IdentityRepository } from './types';

export class IdentityStorageUnavailableError extends Error {
  readonly status = 503;

  constructor() {
    // This message remains recognizable after server-function Error serialization.
    super('Database not connected');
    this.name = 'IdentityStorageUnavailableError';
  }
}

/**
 * An operation failed because a store could not be reached, rather than because the
 * request was wrong. A refused traversal (`failed`) or a lost race (`conflict`) is a
 * fault in this code and must not be reported to the caller as an outage.
 */
function unreachable(error: unknown) {
  return (
    error instanceof DataUnavailableError ||
    (error instanceof GraphRequestError && (error.code === 'aborted' || error.code === 'timeout'))
  );
}

/**
 * Trusted server composition. Availability belongs to the selected identity
 * adapter, independently of campaign/domain storage. It is not authorization,
 * a health lease, a retry policy or permission to select a partial backend.
 *
 * Operations are not preceded by a probe. Every graph and CQL request opens its own
 * authenticated connection, so probing first would add two handshakes to a call that
 * is already going to tell the truth — and a probe that passed a moment ago proves
 * nothing about the request that follows it. An operation that fails because a store
 * was unreachable is reported as unavailable; every other failure is reported as
 * itself. `ensureAvailable` remains an explicit check for callers that must decide
 * before acting, such as minting a session.
 */
export function createIdentityStorage(
  repository: IdentityRepository,
  connect: () => Promise<boolean>
) {
  const ensureAvailable = async () => (await connect()) === true;
  const guard =
    <Args extends unknown[], Result>(operation: (...args: Args) => Promise<Result>) =>
    async (...args: Args): Promise<Result> => {
      // Callers must not be able to change an in-flight command once it is issued.
      const captured = structuredClone(args);
      try {
        // Do not catch/retry/rebase an operation: a failed write may have committed.
        return await operation(...captured);
      } catch (error) {
        if (unreachable(error)) throw new IdentityStorageUnavailableError();
        throw error;
      }
    };
  const available: IdentityRepository = {
    recordLogin: guard(repository.recordLogin.bind(repository)),
    findProfile: guard(repository.findProfile.bind(repository)),
    findUserId: guard(repository.findUserId.bind(repository)),
    readDisplayName: guard(repository.readDisplayName.bind(repository)),
    resolveAudioStoragePrefix: guard(repository.resolveAudioStoragePrefix.bind(repository)),
    lookupAudioStoragePrefix: guard(repository.lookupAudioStoragePrefix.bind(repository)),
    readAccessToken: guard(repository.readAccessToken.bind(repository)),
    clearTokens: guard(repository.clearTokens.bind(repository)),
    readPreferences: guard(repository.readPreferences.bind(repository)),
    setRulerColor: guard(repository.setRulerColor.bind(repository)),
  };
  return { repository: available, ensureAvailable };
}
