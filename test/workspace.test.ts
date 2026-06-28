import { describe, expect, test } from 'bun:test';
import type { FieldMap } from '@inixiative/json-rules';
import { emptyWorkspace, exportWorkspace, importWorkspace, type Workspace } from '../examples/workspace';

const sampleMap: FieldMap = {
  models: { User: { fields: { tier: { kind: 'scalar', type: 'String' } } } },
};

const sample = (): Workspace => ({
  maps: { app: sampleMap },
  bridges: [],
  narrowings: { vip: { mapName: 'app', model: 'User', narrowing: { root: { picks: ['tier'] } } } },
  sources: [
    { map: 'app', model: 'User', field: 'tier', where: { all: [{ field: 'active', operator: 'equals', value: true }] } },
  ],
  rule: { all: [{ field: 'tier', operator: 'equals', value: 'g' }] },
});

describe('workspace', () => {
  test('emptyWorkspace has empty collections and an empty rule', () => {
    expect(emptyWorkspace()).toEqual({
      maps: {},
      bridges: [],
      narrowings: {},
      sources: [],
      rule: { all: [] },
    });
  });

  test('export → import round-trips losslessly', () => {
    const ws = sample();
    expect(importWorkspace(exportWorkspace(ws))).toEqual(ws);
  });

  test('import fills defaults for missing keys', () => {
    const ws = importWorkspace(JSON.stringify({ maps: { app: sampleMap } }));
    expect(ws.bridges).toEqual([]);
    expect(ws.narrowings).toEqual({});
    expect(ws.sources).toEqual([]);
    expect(ws.rule).toEqual({ all: [] });
  });

  test('import throws on malformed JSON', () => {
    expect(() => importWorkspace('{not json')).toThrow();
  });

  test('import throws when the root is not an object', () => {
    expect(() => importWorkspace('42')).toThrow();
    expect(() => importWorkspace('null')).toThrow();
  });

  test('import throws when a present key has the wrong type', () => {
    expect(() => importWorkspace(JSON.stringify({ bridges: 'nope' }))).toThrow(/bridges/);
  });
});
