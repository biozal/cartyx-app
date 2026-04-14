import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('~/utils/posthog-client', () => ({
  captureException: vi.fn(),
  captureEvent: vi.fn(),
}));

import { withRetry } from '~/utils/retryMutation';
import type { RetryContext } from '~/utils/retryMutation';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const ctx: RetryContext = {
  sessionId: 'sess-1',
  campaignId: 'camp-1',
  messageType: 'CHAT',
  messageId: 'uuid-1',
};

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, ctx);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('ok');

    const promise = withRetry(fn, ctx);
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('returns null and calls onExhausted after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const onExhausted = vi.fn();

    const promise = withRetry(fn, ctx, onExhausted);

    for (let i = 0; i < 12; i++) {
      await vi.advanceTimersByTimeAsync(5000);
    }

    const result = await promise;

    expect(result).toBeNull();
    expect(fn).toHaveBeenCalledTimes(13);
    expect(onExhausted).toHaveBeenCalledWith(ctx, expect.any(Error));
  });
});
