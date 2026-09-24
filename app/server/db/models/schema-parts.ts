import { z } from 'zod';
import { newObjectId, objectIdString } from '~/server/repositories/collection';
import type { UpdateQuery } from '~/server/repositories/graph-model';
import { normalizeTags } from '~/server/utils/helpers';

/**
 * Schema pieces shared by the graph models, each mirroring the Mongoose type it replaced:
 * Mongoose cast ISO strings to dates, gave every array an empty default, and gave array
 * subdocuments an `_id` unless told otherwise.
 */
export { objectIdString };
export const objectId = objectIdString;
export const subdocumentId = objectIdString.default(newObjectId);
/** `{ type: Date, default: Date.now }` */
export const now = () => z.coerce.date().default(() => new Date());
/** A date that may be absent or null. */
export const optionalDate = () => z.coerce.date().nullable().optional();
export const tags = () => z.array(z.string()).default([]);

export const cropSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const imageSchema = z.object({
  url: z.string(),
  caption: z.string().default(''),
  crop: cropSchema.nullable().default(null),
});

export const statusSchema = z.object({
  value: z.enum(['alive', 'deceased']).default('alive'),
  changedAt: z.coerce.date().nullable().default(null),
  changedBy: objectIdString.nullable().default(null),
});

export const relationshipSchema = z.object({
  characterId: objectIdString,
  descriptor: z.string(),
  isPublic: z.boolean().default(false),
});

/** The `pre('save')` hook most wiki models shared: tidy tags when changed, touch updatedAt. */
export const touchAndNormalizeTags = <T extends { tags: string[]; updatedAt: Date }>(
  document: T,
  context: { isModified(path: string): boolean }
): T => ({
  ...document,
  tags: context.isModified('tags') ? normalizeTags(document.tags) : document.tags,
  updatedAt: new Date(),
});

export const touch = <T extends { updatedAt: Date }>(document: T): T => ({
  ...document,
  updatedAt: new Date(),
});

/** The `pre('findOneAndUpdate')` hook: touch updatedAt, and tidy tags when `$set`. */
export function touchUpdate(update: UpdateQuery, options: { tags?: boolean } = {}): UpdateQuery {
  const set = { ...((update.$set as Record<string, unknown> | undefined) ?? {}) };
  if (options.tags && Array.isArray(set.tags)) set.tags = normalizeTags(set.tags as string[]);
  set.updatedAt = new Date();
  return { ...update, $set: set };
}
