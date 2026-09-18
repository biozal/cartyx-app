import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('~/server/db/connection', () => ({ connectDB: vi.fn(), isDBConnected: vi.fn(() => true) }));
vi.mock('~/server/repositories/identity', () => import('./identityTestDouble'));
import { identityDouble, identityRepository, resetIdentityDouble } from './identityTestDouble';

const USER = '507f1f77bcf86cd799439011';

beforeEach(() => {
  vi.clearAllMocks();
  resetIdentityDouble({ id: USER });
});

describe('audioUserRoot / assertStoragePrefix', () => {
  it('builds the namespace root for a well-formed prefix', async () => {
    const { audioUserRoot } = await import('~/server/functions/audio-storage');
    expect(audioUserRoot('a1b2c3d4e5f60718293a4b5c6d7e8f90')).toBe(
      'uploads/audio/a1b2c3d4e5f60718293a4b5c6d7e8f90/'
    );
  });

  /**
   * The key builders fail closed. Every one of these values, silently accepted,
   * mints an object OUTSIDE any user's listing prefix — unreclaimable in
   * exactly the way the per-user layout exists to prevent — and the `../` and
   * `/`-bearing ones land inside somebody else's namespace instead.
   */
  it.each([
    ['', 'empty'],
    ['undefined', 'a stringified undefined'],
    ['../0123456789abcdef0123456789abcdef', 'a traversal'],
    ['a1b2c3d4e5f60718293a4b5c6d7e8f90/renditions', 'a nested path'],
    ['A1B2C3D4E5F60718293A4B5C6D7E8F90', 'uppercase hex'],
    ['a1b2c3d4e5f60718293a4b5c6d7e8f9', '31 characters'],
    ['a1b2c3d4e5f60718293a4b5c6d7e8f900', '33 characters'],
    ['z1b2c3d4e5f60718293a4b5c6d7e8f90', 'a non-hex character'],
  ])('refuses %s (%s)', async (value) => {
    const { audioUserRoot } = await import('~/server/functions/audio-storage');
    expect(() => audioUserRoot(value)).toThrow('Invalid audio storage prefix');
  });
});

describe('prefix resolution', () => {
  /**
   * These two functions delegate to the identity repository, which owns allocation.
   * Stability under a concurrent first upload, laziness, and recovery from an
   * interrupted allocation are properties of that allocator and are covered by its own
   * contract (`scripts/identity/*-contract.ts`). What matters here is that the upload
   * path allocates and the read-only path never does, because a scan that minted a
   * namespace would hand one to every account that ever clicked Scan.
   */
  it('allocates on the upload path and returns what the store holds', async () => {
    identityDouble.audioPrefix = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const { resolveAudioStoragePrefix, AUDIO_STORAGE_PREFIX_RE } =
      await import('~/server/functions/audio-storage');
    const prefix = await resolveAudioStoragePrefix(USER);
    expect(prefix).toBe('a1b2c3d4e5f60718293a4b5c6d7e8f90');
    // The shape the worker parses back out of a source key
    // (`audio-worker/src/keys.ts`). A prefix of any other shape would make every
    // rendition key that worker builds fail to resolve.
    expect(prefix).toMatch(AUDIO_STORAGE_PREFIX_RE);
    expect(prefix).toMatch(/^[0-9a-f]{32}$/);
    expect(identityRepository.resolveAudioStoragePrefix).toHaveBeenCalledWith(USER);
  });

  it('never allocates on the read-only path', async () => {
    identityDouble.audioPrefix = null;
    const { lookupAudioStoragePrefix } = await import('~/server/functions/audio-storage');
    expect(await lookupAudioStoragePrefix(USER)).toBeNull();
    expect(identityRepository.resolveAudioStoragePrefix).not.toHaveBeenCalled();
  });

  it('reports an unavailable store rather than answering from nothing', async () => {
    const unavailable = new Error('Database not connected');
    identityRepository.resolveAudioStoragePrefix.mockRejectedValueOnce(unavailable);
    identityRepository.lookupAudioStoragePrefix.mockRejectedValueOnce(unavailable);
    const { resolveAudioStoragePrefix, lookupAudioStoragePrefix } =
      await import('~/server/functions/audio-storage');
    await expect(resolveAudioStoragePrefix(USER)).rejects.toThrow('Database not connected');
    await expect(lookupAudioStoragePrefix(USER)).rejects.toThrow('Database not connected');
  });
});
