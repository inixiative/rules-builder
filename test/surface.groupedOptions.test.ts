import { describe, expect, test } from 'bun:test';
import type { Condition, FieldMap, SourceValues } from '@inixiative/json-rules';
import { Operator } from '@inixiative/json-rules';
import { buildRoot, type LeafNode } from '../src/builder/buildNodes';
import { describeModelFields, resolve } from '../src/schema/surface';

// Grouped sources (json-rules 2.17): one physical column, N vocabularies — each
// option carries its partition in `group`. The builder must not flatten that
// provenance away: it is what lets a facet offer only its partition's values.
const maps: Record<string, FieldMap> = {
  app: {
    models: {
      User: {
        fields: {
          id: { kind: 'scalar', type: 'String' },
          tier: { kind: 'scalar', type: 'String' },
        },
      },
    },
  },
};

const source = {
  maps,
  mapName: 'app',
  model: 'User',
  narrowing: {
    root: {
      sources: { tier: { where: { field: 'id', operator: Operator.notEquals, value: '' } } },
    },
  },
};

const sourceValues: SourceValues[] = [
  {
    path: 'User',
    mapName: 'app',
    model: 'User',
    field: 'tier',
    options: [
      { value: 'gold', group: 'level' },
      { value: 'apac', label: 'APAC', group: 'region' },
      { value: 'plain' },
    ],
  },
];

const lens = resolve(source, { sourceValues });
const fields = describeModelFields(lens, 'app', 'User');
const tier = fields.find((f) => f.name === 'tier');

describe('describeModelFields — grouped source options keep their provenance', () => {
  test('field.options carries the surface options verbatim, group included', () => {
    expect(tier?.options).toEqual([
      { value: 'gold', group: 'level' },
      { value: 'apac', label: 'APAC', group: 'region' },
      { value: 'plain' },
    ]);
  });

  test('enumValues/enumLabels stay derived as before (back-compat)', () => {
    expect(tier?.enumValues).toEqual(['gold', 'apac', 'plain']);
    expect(tier?.enumLabels).toEqual({ apac: 'APAC' });
  });

  test('a field with no options has no options key', () => {
    expect(fields.find((f) => f.name === 'id')?.options).toBeUndefined();
  });
});

describe('leaf ValueControl — options carry group', () => {
  test('the leaf value picker exposes each option with its partition', () => {
    const cond: Condition = { all: [{ field: 'tier', operator: 'equals', value: 'gold' }] };
    const root = buildRoot(cond, lens, fields, 4, () => {});
    const leaf = (root as { children: LeafNode[] }).children[0];
    expect(leaf.value?.options).toEqual([
      { value: 'gold', label: 'gold', group: 'level' },
      { value: 'apac', label: 'APAC', group: 'region' },
      { value: 'plain', label: 'plain' },
    ]);
  });
});
