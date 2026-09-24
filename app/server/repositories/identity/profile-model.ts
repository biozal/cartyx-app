import { createHash } from 'node:crypto';
import { z } from 'zod';
export const profileObjectId = z.string().regex(/^[0-9a-f]{24}$/);
export const profileOperationId = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => Buffer.from(value).toString('utf8') === value)
    .nullable();
const timestamp = z
  .string()
  .datetime()
  .refine((value) => new Date(value).toISOString() === value)
  .nullable();
export const profileSnapshotSchema = z
  .object({
    userId: profileObjectId,
    snapshotId: profileObjectId,
    content: z
      .object({
        firstName: text(1024),
        lastName: text(1024),
        avatarUrl: text(4096),
        role: z.enum(['gm', 'player', 'unknown']).nullable(),
        rulerColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .nullable(),
        createdAt: timestamp,
        lastLoginAt: timestamp,
      })
      .strict(),
  })
  .strict();
export type ProfileSnapshot = z.infer<typeof profileSnapshotSchema>;
export interface ImmutableProfileStore {
  put(snapshot: ProfileSnapshot): Promise<void>;
  get(userId: string, snapshotId: string): Promise<ProfileSnapshot | null>;
}
export function parseProfile<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error('Invalid identity profile record');
  return result.data;
}
export function profileDigest(input: ProfileSnapshot) {
  return createHash('sha256')
    .update(JSON.stringify(parseProfile(profileSnapshotSchema, input)))
    .digest('hex');
}
