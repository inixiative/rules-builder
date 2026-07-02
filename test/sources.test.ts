import { describe, expect, test } from 'bun:test';
import { createLens, type FieldMap, Operator } from '@inixiative/json-rules';
import { runSources } from '../src';

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

const tierSourceWhere = {
  all: [{ field: 'active', operator: Operator.equals, value: true }],
};

describe('runSources (library helper)', () => {
  test('returns DISTINCT column values under the source where (as SourceValues)', () => {
    const lens = createLens({ maps, mapName: 'app', model: 'User' });
    const narrowed = {
      parent: lens,
      root: { sources: { tier: tierSourceWhere } },
    };
    expect(runSources(narrowed, rows)).toEqual([
      {
        path: 'User',
        mapName: 'app',
        model: 'User',
        field: 'tier',
        options: [{ value: 'gold' }, { value: 'silver' }],
      },
    ]);
  });

  test('the narrowing where composes (AND) with the source where before DISTINCT', () => {
    const lens = createLens({ maps, mapName: 'app', model: 'User' });
    const narrowed = {
      parent: lens,
      root: {
        where: {
          all: [{ field: 'tier', operator: Operator.notEquals, value: 'gold' }],
        },
        sources: { tier: tierSourceWhere },
      },
    };
    expect(runSources(narrowed, rows)).toEqual([
      {
        path: 'User',
        mapName: 'app',
        model: 'User',
        field: 'tier',
        options: [{ value: 'silver' }],
      },
    ]);
  });

  test('a lens with no sources yields no option sets', () => {
    const lens = createLens({ maps, mapName: 'app', model: 'User' });
    expect(runSources(lens, rows)).toEqual([]);
  });
});
