// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { decodeDocument, defineEntity, encodeDocument } from '~/server/db/graph/entity-codec';

const note = defineEntity({
  kind: 'CodecNote',
  version: 1,
  schema: z.object({
    title: z.string(),
    createdAt: z.date(),
    nested: z.object({ at: z.date().nullable(), text: z.string() }),
    history: z.array(z.object({ at: z.date() })),
  }),
  index: {},
});

const value = {
  title: '2026-09-19T12:00:00.000Z',
  createdAt: new Date('2026-09-19T12:00:00.000Z'),
  nested: { at: null, text: '1999-01-01T00:00:00.000Z' },
  history: [{ at: new Date(0) }],
};

describe('entity codec', () => {
  it('round-trips dates as dates and date-shaped text as text', () => {
    const decoded = decodeDocument(note, encodeDocument(note, value), 1);
    expect(decoded).toEqual(value);
    // The bug this guards: text that happens to look like a timestamp came back as
    // a Date, silently changing a user's content.
    expect(typeof decoded.title).toBe('string');
    expect(typeof decoded.nested.text).toBe('string');
    expect(decoded.createdAt).toBeInstanceOf(Date);
    expect(decoded.history[0]!.at).toBeInstanceOf(Date);
  });

  it('refuses a value whose keys collide with the date tag rather than misreading it', () => {
    const loose = defineEntity({
      kind: 'CodecLoose',
      version: 1,
      schema: z.record(z.string(), z.unknown()),
      index: {},
    });
    expect(() => encodeDocument(loose, { $cartyxDate: 'x' })).toThrow();
    expect(() => encodeDocument(loose, { inner: { $cartyxDate: 'x' } })).toThrow();
  });

  it('refuses an invalid stored date instead of producing Invalid Date', () => {
    const stored = JSON.stringify({ ...value, createdAt: { $cartyxDate: 'not a date' } });
    expect(() => decodeDocument(note, stored, 1)).toThrow();
  });
});
