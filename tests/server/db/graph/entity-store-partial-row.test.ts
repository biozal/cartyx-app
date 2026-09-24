// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineEntity } from '~/server/db/graph/entity-codec';
import { createGraphEntityStore } from '~/server/db/graph/graph-entity-store';

/**
 * A read is not isolated from a concurrent removal: dropping a vertex deletes its
 * properties, and another transaction can see that half-applied. A row whose document
 * is already gone is an entity being removed, so it reads as absent — a writer racing
 * a delete gets "not found" rather than an integrity error. A document that IS there
 * but malformed stays an integrity failure.
 */
const codec = defineEntity<{ name: string }>({
  kind: 'PartialThing',
  version: 1,
  schema: z.object({ name: z.string() }),
  index: { name: 'ix_s1' },
});

const ID = '0'.repeat(24);
const SCOPE = { type: 'global' } as const;
/** One projected row, as the driver returns it. */
const row = (fields: Record<string, unknown>) => new Map(Object.entries(fields));
const storeReturning = (...rows: unknown[]) =>
  createGraphEntityStore({ execute: async () => rows });

const complete = {
  doc: JSON.stringify({ name: 'Inn' }),
  docVersion: 1,
  revision: 3,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  scope: 'global',
  entityId: ID,
};

describe('a partially removed row', () => {
  it('reads as absent when the document is gone', async () => {
    const { doc: _doc, ...withoutDocument } = complete;
    expect(await storeReturning(row(withoutDocument)).get(codec, SCOPE, ID)).toBeNull();
  });

  it('is left out of a listing rather than failing it', async () => {
    const { doc: _doc, ...withoutDocument } = complete;
    const store = storeReturning(row(complete), row(withoutDocument));
    const listed = await store.list(codec, SCOPE, { limit: 10 });
    expect(listed.map((item) => item.value.name)).toEqual(['Inn']);
  });

  it('still reads a complete row', async () => {
    const stored = await storeReturning(row(complete)).get(codec, SCOPE, ID);
    expect(stored?.value).toEqual({ name: 'Inn' });
    expect(stored?.revision).toBe(3);
  });

  it('still refuses a document that is present but not a string', async () => {
    await expect(
      storeReturning(row({ ...complete, doc: 42 })).get(codec, SCOPE, ID)
    ).rejects.toThrow(/Corrupt PartialThing record/);
  });
});
