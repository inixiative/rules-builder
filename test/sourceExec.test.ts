import { describe, expect, test } from 'bun:test';
import { createLens, type FieldMap, Operator } from '@inixiative/json-rules';
import {
  computeAllSources,
  injectSources,
  runSources,
  type WorkspaceSource,
} from '../examples/sourceExec';

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

const tierSource: WorkspaceSource = {
  map: 'app',
  model: 'User',
  field: 'tier',
  where: { all: [{ field: 'active', operator: Operator.equals, value: true }] },
};

describe('demo source executor', () => {
  test('computeAllSources returns DISTINCT column values under the where (as SourceValues)', () => {
    const computed = computeAllSources(maps, [], [tierSource], rows);
    expect(computed).toEqual([
      { path: 'User', mapName: 'app', model: 'User', field: 'tier', values: ['gold', 'silver'] },
    ]);
  });

  test('a lens narrowing composes with the source where (AND) before DISTINCT', () => {
    const lens = createLens({ maps, mapName: 'app', model: 'User' });
    const narrowed = injectSources(
      { root: { where: { all: [{ field: 'tier', operator: Operator.notEquals, value: 'gold' }] } } },
      [tierSource],
    );
    const computed = runSources({ parent: lens, ...narrowed }, rows);
    // active = true  AND  tier != gold  → only silver
    expect(computed).toEqual([
      { path: 'User', mapName: 'app', model: 'User', field: 'tier', values: ['silver'] },
    ]);
  });
});
