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
 * Trusted server composition. Availability belongs to the selected identity
 * adapter, independently of campaign/domain storage. It is not authorization,
 * a health lease, a retry policy or permission to select a partial backend.
 */
export function createIdentityStorage(
  repository: IdentityRepository,
  connect: () => Promise<boolean>
) {
  const ensureAvailable = async () => (await connect()) === true;
  const guard =
    <Args extends unknown[], Result>(operation: (...args: Args) => Promise<Result>) =>
    async (...args: Args): Promise<Result> => {
      // The availability await must not let callers change an in-flight command.
      const captured = structuredClone(args);
      if (!(await ensureAvailable())) throw new IdentityStorageUnavailableError();
      // Do not catch/retry/rebase an operation: a failed write may have committed.
      return operation(...captured);
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
