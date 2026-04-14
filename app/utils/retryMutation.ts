import { captureEvent } from '~/utils/posthog-client';

const RETRY_DELAY_MS = 5_000;
const MAX_RETRIES = 12;

export interface RetryContext {
  sessionId: string;
  campaignId: string;
  messageType: 'CHAT' | 'DICE' | 'SPELL_CARD';
  messageId: string;
}

export type OnRetriesExhausted = (context: RetryContext, error: unknown) => void;

export async function withRetry<T>(
  fn: () => Promise<T>,
  context: RetryContext,
  onExhausted?: OnRetriesExhausted
): Promise<T | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        console.error(
          `[Save] Failed after ${MAX_RETRIES} retries`,
          context.messageType,
          context.messageId,
          err
        );

        captureEvent('party.mongo_save_failed', {
          sessionId: context.sessionId,
          campaignId: context.campaignId,
          messageType: context.messageType,
          messageId: context.messageId,
          errorMessage: err instanceof Error ? err.message : String(err),
          errorName: err instanceof Error ? err.name : undefined,
        });

        onExhausted?.(context, err);
        return null;
      }

      console.warn(
        `[Save] Attempt ${attempt + 1} failed, retrying in ${RETRY_DELAY_MS}ms`,
        context.messageType,
        context.messageId
      );

      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  return null;
}
