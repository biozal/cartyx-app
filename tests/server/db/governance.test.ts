import { describe, it, expect } from 'vitest';
import { INDEX_GOVERNANCE, getSeverity, normalizeIndexKey } from '~/server/db/governance';

describe('INDEX_GOVERNANCE registry', () => {
  it('contains entries for all six models', () => {
    expect(Object.keys(INDEX_GOVERNANCE)).toEqual(
      expect.arrayContaining(['User', 'Campaign', 'Session', 'Player', 'GMScreen', 'Note'])
    );
  });

  it('every entry has a valid severity', () => {
    for (const [, entries] of Object.entries(INDEX_GOVERNANCE)) {
      for (const entry of entries) {
        expect(['critical', 'optional']).toContain(entry.severity);
        expect(Object.keys(entry.key).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('getSeverity', () => {
  it('returns critical for User email index', () => {
    expect(getSeverity('User', { email: 1 })).toBe('critical');
  });

  it('returns optional for User role index', () => {
    expect(getSeverity('User', { role: 1 })).toBe('optional');
  });

  it('returns optional for Player campaignId index', () => {
    expect(getSeverity('Player', { campaignId: 1 })).toBe('optional');
  });

  it('returns critical for GMScreen campaignId+tabOrder unique index', () => {
    expect(getSeverity('GMScreen', { campaignId: 1, tabOrder: 1 })).toBe('critical');
  });

  it('returns critical for GMScreen campaignId+name unique index', () => {
    expect(getSeverity('GMScreen', { campaignId: 1, name: 1 })).toBe('critical');
  });

  it('returns undefined for unknown model', () => {
    expect(getSeverity('Unknown', { foo: 1 })).toBeUndefined();
  });

  it('returns undefined for unregistered index key', () => {
    expect(getSeverity('User', { firstName: 1 })).toBeUndefined();
  });

  it('returns optional for Note campaignId+updatedAt compound index', () => {
    expect(getSeverity('Note', { campaignId: 1, updatedAt: -1 })).toBe('optional');
  });

  it('returns optional for Note text index via schema-declared key form', () => {
    expect(getSeverity('Note', { title: 'text', note: 'text' })).toBe('optional');
  });
});

describe('normalizeIndexKey', () => {
  it('collapses pure text index to canonical MongoDB form', () => {
    expect(normalizeIndexKey({ title: 'text', note: 'text' })).toEqual({
      _fts: 'text',
      _ftsx: 1,
    });
  });

  it('preserves non-text prefix fields in compound text indexes', () => {
    expect(normalizeIndexKey({ campaignId: 1, title: 'text', note: 'text' })).toEqual({
      campaignId: 1,
      _fts: 'text',
      _ftsx: 1,
    });
  });

  it('returns non-text index keys unchanged', () => {
    expect(normalizeIndexKey({ campaignId: 1, updatedAt: -1 })).toEqual({
      campaignId: 1,
      updatedAt: -1,
    });
  });
});
