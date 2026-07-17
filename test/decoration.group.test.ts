import { describe, expect, test } from 'bun:test';
import type { Condition, FieldMap, SourceValues } from '@inixiative/json-rules';
import { describeFacets, describeModelFields, resolve } from '../src';
import { type ArrayNode, buildRoot, type LeafNode } from '../src/builder/buildNodes';
import { type Decoration, facetElementLeaf } from '../src/schema/decoration';

// Facet.group: a facet may pin its value picker to ONE partition of a grouped
// source (json-rules 2.17). Purely presentational — identity stays path+where;
// the group never enters the rule and never affects rehydration.
const maps: Record<string, FieldMap> = {
  app: {
    models: {
      User: {
        fields: {
          id: { kind: 'scalar', type: 'String' },
          enrichments: { kind: 'object', type: 'Enrichment', isList: true },
        },
      },
      Enrichment: {
        fields: {
          key: { kind: 'scalar', type: 'String' },
          value: { kind: 'scalar', type: 'String' },
        },
      },
    },
  },
};

const sourceValues: SourceValues[] = [
  {
    path: 'User.enrichments',
    mapName: 'app',
    model: 'Enrichment',
    field: 'value',
    options: [
      { value: 'Manufacturing', group: 'Industry' },
      { value: 'Healthcare', group: 'Industry' },
      { value: 'marketing', group: 'Business Unit' },
      { value: 'plain' },
    ],
  },
];

const source = {
  maps,
  mapName: 'app',
  model: 'User',
  narrowing: {
    root: {
      relations: {
        enrichments: { sources: { value: { groupBy: 'key' } } },
      },
    },
  },
};
const lens = resolve(source, { sourceValues });

const industryFacet = {
  path: 'enrichments.value',
  where: { field: 'key', operator: 'equals', value: 'industry' } as Condition,
  label: 'Industry',
  group: 'Industry',
};

describe('facetElementLeaf — group pins the partition', () => {
  test('a grouped facet narrows options/enumValues/enumLabels to its partition', () => {
    const leaf = facetElementLeaf(lens, industryFacet);
    expect(leaf?.options).toEqual([
      { value: 'Manufacturing', group: 'Industry' },
      { value: 'Healthcare', group: 'Industry' },
    ]);
    expect(leaf?.enumValues).toEqual(['Manufacturing', 'Healthcare']);
  });

  test('a groupless facet keeps the full option set', () => {
    const leaf = facetElementLeaf(lens, { ...industryFacet, group: undefined });
    expect(leaf?.options?.map((o) => o.value)).toEqual([
      'Manufacturing',
      'Healthcare',
      'marketing',
      'plain',
    ]);
  });

  test('an unknown group yields an empty partition (definition without data yet)', () => {
    const leaf = facetElementLeaf(lens, { ...industryFacet, group: 'Deal Size' });
    expect(leaf?.options).toEqual([]);
    expect(leaf?.enumValues).toEqual([]);
  });
});

describe('buildRoot — a matched grouped facet filters the element value picker', () => {
  const decoration: Decoration = { facets: [industryFacet] };
  const fields = describeModelFields(lens, 'app', 'User');

  test('the condition leaf on value offers only the partition options', () => {
    const cond: Condition = {
      all: [
        {
          field: 'enrichments',
          arrayOperator: 'any',
          condition: {
            all: [
              { field: 'key', operator: 'equals', value: 'industry' },
              { field: 'value', operator: 'equals', value: 'Manufacturing' },
            ],
          },
        },
      ],
    };
    const root = buildRoot(cond, lens, fields, 4, () => {}, { decoration });
    const arr = (root as { children: ArrayNode[] }).children[0];
    expect(arr.hoist?.label).toBe('Industry');
    const valueLeaf = arr.condition?.children[1] as LeafNode;
    expect(valueLeaf.value?.options).toEqual([
      { value: 'Manufacturing', label: 'Manufacturing', group: 'Industry' },
      { value: 'Healthcare', label: 'Healthcare', group: 'Industry' },
    ]);
  });
});

describe('leaf facets — group applies on a root sourced field too', () => {
  const flatMaps: Record<string, FieldMap> = {
    app: { models: { User: { fields: { tier: { kind: 'scalar', type: 'String' } } } } },
  };
  const flatLens = resolve(
    {
      maps: flatMaps,
      mapName: 'app',
      model: 'User',
      narrowing: { root: { sources: { tier: { groupBy: 'tier' } } } },
    },
    {
      sourceValues: [
        {
          path: 'User',
          mapName: 'app',
          model: 'User',
          field: 'tier',
          options: [
            { value: 'gold', group: 'level' },
            { value: 'apac', group: 'region' },
          ],
        },
      ],
    },
  );

  test('describeFacets narrows a leaf facet to its partition', () => {
    const decoration: Decoration = {
      facets: [{ path: 'tier', label: 'Level', group: 'level' }],
    };
    const facetField = describeFacets(flatLens, decoration).find((f) => f.name === 'tier');
    expect(facetField?.options).toEqual([{ value: 'gold', group: 'level' }]);
    expect(facetField?.enumValues).toEqual(['gold']);
  });
});
