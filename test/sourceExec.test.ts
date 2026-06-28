import { describe, expect, test } from 'bun:test';
import { createLens, type FieldMap, Operator } from '@inixiative/json-rules';
import { runSources } from '../examples/sourceExec';

const maps: Record<string, FieldMap> = {
  app: {
    models: {
      User: {
        fields: {
          tier: { kind: 'scalar', type: 'String' },
          active: { kind: 'scalar', type: 'Boolean' },
        },
      },
    },
  },
};

const rows = {
  User: [
    { tier: 'gold', active: true },
    { tier: 'silver', active: true },
    { tier: 'silver', active: true }, // duplicate → distinct
    { tier: 'bronze', active: false }, // dropped by where
  ],
};

const tierSourceWhere = { all: [{ field: 'active', operator: Operator.equals, value: true }] };

describe('demo source executor', () => {
  test('runSources returns DISTINCT column values under the source where (as SourceValues)', () => {
    const lens = createLens({ maps, mapName: 'app', model: 'User' });
    const narrowed = { parent: lens, root: { sources: { tier: tierSourceWhere } } };
    expect(runSources(narrowed, rows)).toEqual([
      { path: 'User', mapName: 'app', model: 'User', field: 'tier', values: ['gold', 'silver'] },
    ]);
  });

  test('the narrowing where composes (AND) with the source where before DISTINCT', () => {
    const lens = createLens({ maps, mapName: 'app', model: 'User' });
    const narrowed = {
      parent: lens,
      root: {
        where: { all: [{ field: 'tier', operator: Operator.notEquals, value: 'gold' }] },
        sources: { tier: tierSourceWhere },
      },
    };
    // active = true  AND  tier != gold  → only silver
    expect(runSources(narrowed, rows)).toEqual([
      { path: 'User', mapName: 'app', model: 'User', field: 'tier', values: ['silver'] },
    ]);
  });
});
