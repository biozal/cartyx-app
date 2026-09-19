import { z } from 'zod';
import { parseProfile, profileObjectId, profileOperationId } from './profile-model';
import type { IdentityTokenFence } from './types';

export const identityTokenFenceSchema = z
  .object({
    userId: profileObjectId,
    providerId: z
      .string()
      .min(1)
      .max(1024)
      .refine((value) => Buffer.from(value).toString('utf8') === value),
    tokenRevision: profileOperationId,
  })
  .strict();

export function parseIdentityTokenFence(input: IdentityTokenFence): IdentityTokenFence {
  return parseProfile(identityTokenFenceSchema, input);
}
