import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  gmScreenMock,
  raceMock,
  mapMock,
  mapTokenMock,
  mapTextMock,
  mapDrawingMock,
  mapAoeMock,
  monsterMock,
} = vi.hoisted(() => {
  function make(
    name: string,
    collectionName: string,
    schemaIndexes: Array<[Record<string, unknown>, Record<string, unknown>]>
  ) {
    return {
      modelName: name,
      collection: { collectionName },
      schema: { indexes: vi.fn().mockReturnValue(schemaIndexes) },
      listIndexes: vi.fn().mockResolvedValue([{ key: { _id: 1 } }]),
      createCollection: vi.fn().mockResolvedValue(undefined),
      createIndexes: vi.fn().mockResolvedValue(undefined),
    };
  }

  return {
    gmScreenMock: make('GMScreen', 'gmscreen', [
      [{ campaignId: 1, tabOrder: 1 }, { unique: true }],
      [{ campaignId: 1, name: 1 }, { unique: true }],
    ]),
    raceMock: make('Race', 'races', [
      [{ campaignId: 1 }, {}],
      [{ campaignId: 1, updatedAt: -1 }, {}],
      [{ createdBy: 1 }, {}],
      [{ tags: 1 }, {}],
      [{ title: 'text', content: 'text' }, {}],
    ]),
    mapMock: make('Map', 'map', [
      [{ campaignId: 1, updatedAt: -1 }, {}],
      [{ campaignId: 1, locationId: 1 }, {}],
      [{ campaignId: 1, name: 1 }, { unique: true }],
    ]),
    mapTokenMock: make('MapToken', 'mapToken', [
      [{ mapId: 1 }, {}],
      [{ mapId: 1, sourceCollection: 1, sourceDocumentId: 1, instanceNumber: 1 }, { unique: true }],
    ]),
    mapTextMock: make('MapText', 'mapText', [[{ mapId: 1, campaignId: 1 }, {}]]),
    mapDrawingMock: make('MapDrawing', 'mapDrawing', [[{ mapId: 1, campaignId: 1 }, {}]]),
    mapAoeMock: make('MapAoE', 'mapAoE', [[{ campaignId: 1, mapId: 1 }, {}]]),
    monsterMock: make('Monster', 'monsters', [
      [{ campaignId: 1, updatedAt: -1 }, {}],
      [{ campaignId: 1, name: 1 }, {}],
      [{ campaignId: 1, tags: 1 }, {}],
      [{ campaignId: 1, sessionId: 1 }, {}],
      [{ campaignId: 1, 'cr.value': 1 }, {}],
      [{ name: 'text', 'features.description': 'text' }, {}],
    ]),
  };
});

vi.mock('~/server/db/models/GMScreen', () => ({ GMScreen: gmScreenMock }));
vi.mock('~/server/db/models/Race', () => ({ Race: raceMock }));
vi.mock('~/server/db/models/Map', () => ({ Map: mapMock }));
vi.mock('~/server/db/models/MapToken', () => ({ MapToken: mapTokenMock }));
vi.mock('~/server/db/models/MapText', () => ({ MapText: mapTextMock }));
vi.mock('~/server/db/models/MapDrawing', () => ({ MapDrawing: mapDrawingMock }));
vi.mock('~/server/db/models/MapAoE', () => ({ MapAoE: mapAoeMock }));
vi.mock('~/server/db/models/Monster', () => ({ Monster: monsterMock }));

import {
  inspectIndexes,
  syncCollectionsAndIndexes,
  ensureCollections,
  ALL_MODELS,
} from '~/server/db/inspect';

const allMocks = [
  gmScreenMock,
  raceMock,
  mapMock,
  mapTokenMock,
  mapTextMock,
  mapDrawingMock,
  mapAoeMock,
  monsterMock,
];

describe('ALL_MODELS', () => {
  it('contains the eight models still on MongoDB', () => {
    expect(ALL_MODELS).toHaveLength(8);
  });

  it('no longer inspects users or campaigns, which moved to the graph', () => {
    const names = ALL_MODELS.map((m) => m.modelName);
    expect(names).not.toContain('User');
    expect(names).not.toContain('Campaign');
  });

  it('includes the shared map-object models for index governance', () => {
    const names = ALL_MODELS.map((m) => m.modelName);
    expect(names).toEqual(expect.arrayContaining(['MapText', 'MapDrawing', 'MapAoE']));
  });

  // Regression: Session and GMScreen are included in bootstrap (#302)

  it('no longer inspects models that moved to the graph', () => {
    const names = ALL_MODELS.map((m) => m.modelName);
    for (const moved of ['Player', 'Session', 'Note']) expect(names).not.toContain(moved);
  });

  it('includes GMScreen model for bootstrap collection/index sync', () => {
    const names = ALL_MODELS.map((m) => m.modelName);
    expect(names).toContain('GMScreen');
  });
});

describe('inspectIndexes', () => {
  beforeEach(() => {
    for (const m of allMocks) {
      m.listIndexes.mockReset().mockResolvedValue([{ key: { _id: 1 } }]);
    }
  });

  it('reports ok when all schema indexes exist in the database with matching options', async () => {
    mapTokenMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      {
        key: { mapId: 1, sourceCollection: 1, sourceDocumentId: 1, instanceNumber: 1 },
        unique: true,
      },
      { key: { mapId: 1 } },
    ]);
    gmScreenMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      { key: { campaignId: 1, tabOrder: 1 }, unique: true },
      { key: { campaignId: 1, name: 1 }, unique: true },
    ]);
    raceMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      { key: { campaignId: 1 } },
      { key: { campaignId: 1, updatedAt: -1 } },
      { key: { createdBy: 1 } },
      { key: { tags: 1 } },
      { key: { _fts: 'text', _ftsx: 1 } },
    ]);
    mapMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      { key: { campaignId: 1, updatedAt: -1 } },
      { key: { campaignId: 1, locationId: 1 } },
      { key: { campaignId: 1, name: 1 }, unique: true },
    ]);
    mapTokenMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      { key: { mapId: 1 } },
      {
        key: { mapId: 1, sourceCollection: 1, sourceDocumentId: 1, instanceNumber: 1 },
        unique: true,
      },
    ]);
    monsterMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      { key: { campaignId: 1, updatedAt: -1 } },
      { key: { campaignId: 1, name: 1 } },
      { key: { campaignId: 1, tags: 1 } },
      { key: { campaignId: 1, sessionId: 1 } },
      { key: { campaignId: 1, 'cr.value': 1 } },
      { key: { _fts: 'text', _ftsx: 1 } },
    ]);
    mapTextMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      { key: { mapId: 1, campaignId: 1 } },
    ]);
    mapDrawingMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      { key: { mapId: 1, campaignId: 1 } },
    ]);
    mapAoeMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      { key: { campaignId: 1, mapId: 1 } },
    ]);

    const result = await inspectIndexes();
    expect(result.ok).toBe(true);
    expect(result.hasCriticalDrift).toBe(false);
    for (const diff of result.diffs) {
      expect(diff.missing).toHaveLength(0);
      expect(diff.extra).toHaveLength(0);
      expect(diff.optionMismatches).toHaveLength(0);
    }
  });

  it('reports missing indexes when DB has only _id', async () => {
    const result = await inspectIndexes();

    expect(result.ok).toBe(false);

    const mapTokenDiff = result.diffs.find((d) => d.model === 'MapToken')!;
    expect(mapTokenDiff.missing).toHaveLength(2);

    const gmScreenDiff = result.diffs.find((d) => d.model === 'GMScreen')!;
    expect(gmScreenDiff.missing).toHaveLength(2);
  });

  it('reports extra indexes not in the schema', async () => {
    mapTokenMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      {
        key: { mapId: 1, sourceCollection: 1, sourceDocumentId: 1, instanceNumber: 1 },
        unique: true,
      },
      { key: { mapId: 1 } },
      { key: { name: 1 } },
    ]);

    const result = await inspectIndexes();
    const mapTokenDiff = result.diffs.find((d) => d.model === 'MapToken')!;
    expect(mapTokenDiff.extra).toHaveLength(1);
    expect(mapTokenDiff.extra[0]!.key).toEqual({ name: 1 });
  });

  it('reports ok=false when extra indexes exist even if none are missing', async () => {
    mapTokenMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      {
        key: { mapId: 1, sourceCollection: 1, sourceDocumentId: 1, instanceNumber: 1 },
        unique: true,
      },
      { key: { mapId: 1 } },
      { key: { name: 1 } },
    ]);
    gmScreenMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      { key: { campaignId: 1, tabOrder: 1 }, unique: true },
      { key: { campaignId: 1, name: 1 }, unique: true },
    ]);

    const result = await inspectIndexes();
    expect(result.ok).toBe(false);
  });

  it('detects option mismatches (e.g. unique expected but missing in DB)', async () => {
    // Schema expects the token compound index with unique: true
    // DB has it without unique
    mapTokenMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      { key: { mapId: 1, sourceCollection: 1, sourceDocumentId: 1, instanceNumber: 1 } },
      { key: { mapId: 1 } },
    ]);

    const result = await inspectIndexes();
    const mapTokenDiff = result.diffs.find((d) => d.model === 'MapToken')!;
    expect(mapTokenDiff.missing).toHaveLength(0);
    expect(mapTokenDiff.optionMismatches).toHaveLength(1);
    expect(mapTokenDiff.optionMismatches[0]!.key).toEqual({
      mapId: 1,
      sourceCollection: 1,
      sourceDocumentId: 1,
      instanceNumber: 1,
    });
    expect(mapTokenDiff.optionMismatches[0]!.expected).toEqual({ unique: true });
    expect(mapTokenDiff.optionMismatches[0]!.actual).toEqual({});
  });

  it('reports ok=false when option mismatches exist', async () => {
    mapTokenMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      { key: { mapId: 1, sourceCollection: 1, sourceDocumentId: 1, instanceNumber: 1 } }, // missing unique + sparse options
      { key: { mapId: 1 } },
    ]);
    gmScreenMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      { key: { campaignId: 1, tabOrder: 1 }, unique: true },
      { key: { campaignId: 1, name: 1 }, unique: true },
    ]);

    const result = await inspectIndexes();
    expect(result.ok).toBe(false);
  });

  it('handles NamespaceNotFound (code 26) gracefully when collection does not exist', async () => {
    const nsError = Object.assign(new Error('ns not found'), { code: 26 });
    mapTokenMock.listIndexes.mockRejectedValue(nsError);

    const result = await inspectIndexes();

    const mapTokenDiff = result.diffs.find((d) => d.model === 'MapToken')!;
    expect(mapTokenDiff.missing).toHaveLength(2);
    expect(mapTokenDiff.extra).toHaveLength(0);
    expect(mapTokenDiff.optionMismatches).toHaveLength(0);
  });

  it('rethrows non-NamespaceNotFound errors from listIndexes', async () => {
    const authError = Object.assign(new Error('not authorized'), { code: 13 });
    mapTokenMock.listIndexes.mockRejectedValue(authError);

    await expect(inspectIndexes()).rejects.toThrow('not authorized');
  });

  it('annotates missing indexes with governance severity', async () => {
    const result = await inspectIndexes();

    const mapTokenDiff = result.diffs.find((d) => d.model === 'MapToken')!;
    const uniqueMissing = mapTokenDiff.missing.find((m) => 'instanceNumber' in m.key);
    expect(uniqueMissing?.severity).toBe('critical');

    const membersMissing = mapTokenDiff.missing.find((m) => Object.keys(m.key).join() === 'mapId');
    expect(membersMissing?.severity).toBe('optional');
  });

  it('annotates option mismatches with governance severity', async () => {
    mapTokenMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      { key: { mapId: 1, sourceCollection: 1, sourceDocumentId: 1, instanceNumber: 1 } }, // missing unique + sparse
      { key: { mapId: 1 } },
    ]);

    const result = await inspectIndexes();
    const mapTokenDiff = result.diffs.find((d) => d.model === 'MapToken')!;
    const uniqueMismatch = mapTokenDiff.optionMismatches.find((m) => 'instanceNumber' in m.key);
    expect(uniqueMismatch?.severity).toBe('critical');
  });

  it('sets hasCriticalDrift=true when a critical index is missing', async () => {
    // All mocks default to only _id, so the MapToken unique index (critical) is missing
    const result = await inspectIndexes();
    expect(result.hasCriticalDrift).toBe(true);
  });

  it('sets hasCriticalDrift=false when only optional indexes have drift', async () => {
    // Provide all critical indexes, but leave some optional ones missing
    mapTokenMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      {
        key: { mapId: 1, sourceCollection: 1, sourceDocumentId: 1, instanceNumber: 1 },
        unique: true,
      },
      // mapId (optional) is missing
    ]);
    gmScreenMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      { key: { campaignId: 1, tabOrder: 1 }, unique: true },
      { key: { campaignId: 1, name: 1 }, unique: true },
    ]);
    mapMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      { key: { campaignId: 1, name: 1 }, unique: true },
      // optional indexes (updatedAt, locationId) are missing
    ]);
    mapTokenMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      {
        key: { mapId: 1, sourceCollection: 1, sourceDocumentId: 1, instanceNumber: 1 },
        unique: true,
      },
      // optional mapId-only index is missing
    ]);

    const result = await inspectIndexes();
    expect(result.ok).toBe(false);
    expect(result.hasCriticalDrift).toBe(false);
  });

  it('sets hasCriticalDrift=true when a critical index has option mismatch', async () => {
    mapTokenMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      { key: { mapId: 1, sourceCollection: 1, sourceDocumentId: 1, instanceNumber: 1 } }, // missing unique+sparse = critical option mismatch
      { key: { mapId: 1 } },
    ]);
    gmScreenMock.listIndexes.mockResolvedValue([
      { key: { _id: 1 } },
      { key: { campaignId: 1, tabOrder: 1 }, unique: true },
      { key: { campaignId: 1, name: 1 }, unique: true },
    ]);

    const result = await inspectIndexes();
    expect(result.hasCriticalDrift).toBe(true);
  });
});

describe('ensureCollections', () => {
  beforeEach(() => {
    for (const m of allMocks) {
      m.createCollection.mockClear();
      m.createIndexes.mockClear();
    }
  });

  it('creates all collections but does not create indexes', async () => {
    await ensureCollections();

    for (const m of allMocks) {
      expect(m.createCollection).toHaveBeenCalledTimes(1);
      expect(m.createIndexes).not.toHaveBeenCalled();
    }
  });
});

describe('syncCollectionsAndIndexes', () => {
  beforeEach(() => {
    for (const m of allMocks) {
      m.createCollection.mockClear();
      m.createIndexes.mockClear();
    }
  });

  it('creates all collections and indexes', async () => {
    await syncCollectionsAndIndexes();

    for (const m of allMocks) {
      expect(m.createCollection).toHaveBeenCalledTimes(1);
      expect(m.createIndexes).toHaveBeenCalledTimes(1);
    }
  });

  it('propagates errors from createCollection', async () => {
    mapTokenMock.createCollection.mockRejectedValueOnce(new Error('create failed'));
    await expect(syncCollectionsAndIndexes()).rejects.toThrow('create failed');
  });

  it('propagates errors from createIndexes', async () => {
    gmScreenMock.createIndexes.mockRejectedValueOnce(new Error('index failed'));
    await expect(syncCollectionsAndIndexes()).rejects.toThrow('index failed');
  });
});
