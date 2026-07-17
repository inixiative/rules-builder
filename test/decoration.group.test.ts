import { describe, expect, test } from 'bun:test';
import type { Condition, FieldMap, SourceValues } from '@inixiative/json-rules';
import { describeModelFields, resolve } from '../src';
import {
  type ArrayNode,
  buildRoot,
  type GroupNode,
  type LeafNode,
} from '../src/builder/buildNodes';
import { type Decoration, matchFacet } from '../src/schema/decoration';

// Author-time partition pinning: a grouped field's options narrow to the
// partition selected by sibling clauses on its axes (the source's groupBy paths,
// carried on the surface). The pin derives FROM the semantic clause, so the
// picker can never promise a narrower vocabulary than the rule enforces — and
// validity gates on the pinned set.
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
          source: { kind: 'scalar', type: 'String' },
          key: { kind: 'scalar', type: 'String' },
          value: { kind: 'scalar', type: 'String' },
        },
      },
    },
  },
};

// Composite axes: (source, key) — the 3-level cascade.
const sourceValues: SourceValues[] = [
  {
    path: 'User.enrichments',
    mapName: 'app',
    model: 'Enrichment',
    field: 'value',
    options: [
      { value: 'Manufacturing', groups: ['Salesforce', 'industry'] },
      { value: 'Healthcare', groups: ['Salesforce', 'industry'] },
      { value: 'Retail', groups: ['HubSpot', 'industry'] },
      { value: 'marketing', groups: ['Salesforce', 'business unit'] },
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
        enrichments: { sources: { value: { groupBy: ['source', 'key'] } } },
      },
    },
  },
};
const lens = resolve(source, { sourceValues });
const fields = describeModelFields(lens, 'app', 'User');

// Facet = SOURCE container: identity is the source clause; the key clause is the
// editable level-2 field selector, declared as a selector so renderers draw it
// generically instead of hardcoding the path.
const salesforceFacet = {
  path: 'enrichments.value',
  where: { field: 'source', operator: 'equals', value: 'Salesforce' } as Condition,
  label: 'Salesforce',
  selectors: [{ field: 'key', label: 'Field', anyLabel: 'Any field' }],
};
const decoration: Decoration = { facets: [salesforceFacet] };

const eavBlock = (conds: Condition[]): Condition => ({
  all: [{ field: 'enrichments', arrayOperator: 'any', condition: { all: conds } }],
});

const valueLeafOf = (root: ReturnType<typeof buildRoot>, index: number): LeafNode =>
  ((root as GroupNode).children[0] as ArrayNode).condition?.children[index] as LeafNode;

describe('sibling-derived pin — surface axes narrow the value picker', () => {
  test('describeModelFields carries the partition axes onto the field', () => {
    const relFields = describeModelFields(lens, 'app', 'Enrichment');
    expect(relFields.find((f) => f.name === 'value')?.groupBy).toEqual(['source', 'key']);
  });

  test('an equals sibling on each axis pins to the exact partition', () => {
    const cond = eavBlock([
      { field: 'source', operator: 'equals', value: 'Salesforce' },
      { field: 'key', operator: 'equals', value: 'industry' },
      { field: 'value', operator: 'equals', value: 'Manufacturing' },
    ]);
    const leaf = valueLeafOf(
      buildRoot(cond, lens, fields, 4, () => {}),
      2,
    );
    expect(leaf.value?.options).toEqual([
      { value: 'Manufacturing', label: 'Manufacturing', groups: ['Salesforce', 'industry'] },
      { value: 'Healthcare', label: 'Healthcare', groups: ['Salesforce', 'industry'] },
    ]);
  });

  test('one constrained axis pins that axis only; the other stays free', () => {
    const cond = eavBlock([
      { field: 'key', operator: 'equals', value: 'industry' },
      { field: 'value', operator: 'equals', value: '' },
    ]);
    const leaf = valueLeafOf(
      buildRoot(cond, lens, fields, 4, () => {}),
      1,
    );
    expect(leaf.value?.options?.map((o) => o.value)).toEqual([
      'Manufacturing',
      'Healthcare',
      'Retail',
    ]);
  });

  test('an `in` sibling pins to the union of its partitions', () => {
    const cond = eavBlock([
      { field: 'source', operator: 'in', value: ['HubSpot'] },
      { field: 'value', operator: 'equals', value: '' },
    ]);
    const leaf = valueLeafOf(
      buildRoot(cond, lens, fields, 4, () => {}),
      1,
    );
    expect(leaf.value?.options?.map((o) => o.value)).toEqual(['Retail']);
  });

  test('no axis sibling → the full sectioned set, ungrouped options included', () => {
    const cond = eavBlock([{ field: 'value', operator: 'equals', value: '' }]);
    const leaf = valueLeafOf(
      buildRoot(cond, lens, fields, 4, () => {}),
      0,
    );
    expect(leaf.value?.options?.map((o) => o.value)).toEqual([
      'Manufacturing',
      'Healthcare',
      'Retail',
      'marketing',
      'plain',
    ]);
  });

  test('a pinned set excludes ungrouped options', () => {
    const cond = eavBlock([
      { field: 'source', operator: 'equals', value: 'Salesforce' },
      { field: 'value', operator: 'equals', value: '' },
    ]);
    const leaf = valueLeafOf(
      buildRoot(cond, lens, fields, 4, () => {}),
      1,
    );
    expect(leaf.value?.options?.every((o) => o.groups?.[0] === 'Salesforce')).toBe(true);
  });

  test('VALIDITY gates on the pinned set — an out-of-partition value flags invalid', () => {
    const cond = eavBlock([
      { field: 'source', operator: 'equals', value: 'Salesforce' },
      { field: 'key', operator: 'equals', value: 'industry' },
      { field: 'value', operator: 'equals', value: 'marketing' }, // business unit value
    ]);
    const leaf = valueLeafOf(
      buildRoot(cond, lens, fields, 4, () => {}),
      2,
    );
    expect(leaf.value?.valid).toBe(false);
  });

  test('an `any` block does not pin — its siblings are not conjunctive', () => {
    const cond: Condition = {
      all: [
        {
          field: 'enrichments',
          arrayOperator: 'any',
          condition: {
            any: [
              { field: 'key', operator: 'equals', value: 'industry' },
              { field: 'value', operator: 'equals', value: '' },
            ],
          },
        },
      ],
    };
    const arr = (buildRoot(cond, lens, fields, 4, () => {}) as GroupNode).children[0] as ArrayNode;
    const leaf = arr.condition?.children[1] as LeafNode;
    expect(leaf.value?.options?.map((o) => o.value)).toEqual([
      'Manufacturing',
      'Healthcare',
      'Retail',
      'marketing',
      'plain',
    ]);
  });

  test('a bind-valued sibling does not pin (author-time cannot resolve it)', () => {
    const cond = eavBlock([
      { field: 'source', operator: 'equals', bind: 'src' } as Condition,
      { field: 'value', operator: 'equals', value: '' },
    ]);
    const leaf = valueLeafOf(
      buildRoot(cond, lens, fields, 4, () => {}),
      1,
    );
    expect(leaf.value?.options).toHaveLength(5);
  });
});

describe('matchFacet — subset identity (order-tolerant)', () => {
  const savedInOrder = {
    field: 'enrichments',
    arrayOperator: 'any',
    condition: {
      all: [
        { field: 'source', operator: 'equals', value: 'Salesforce' },
        { field: 'key', operator: 'equals', value: 'industry' },
        { field: 'value', operator: 'equals', value: 'Manufacturing' },
      ],
    },
  } as Condition;

  const savedReordered = {
    field: 'enrichments',
    arrayOperator: 'any',
    condition: {
      all: [
        { field: 'key', operator: 'equals', value: 'industry' },
        { field: 'value', operator: 'equals', value: 'Manufacturing' },
        { field: 'source', operator: 'equals', value: 'Salesforce' }, // identity NOT leading
      ],
    },
  } as Condition;

  test('identity leading: matches', () => {
    expect(matchFacet(lens, decoration, savedInOrder)).toBe(salesforceFacet);
  });

  test('identity anywhere in the block: still matches (AI-authored ordering)', () => {
    expect(matchFacet(lens, decoration, savedReordered)).toBe(salesforceFacet);
  });

  test('a block without the identity clause does not match', () => {
    const other = {
      field: 'enrichments',
      arrayOperator: 'any',
      condition: {
        all: [
          { field: 'source', operator: 'equals', value: 'HubSpot' },
          { field: 'value', operator: 'equals', value: 'Retail' },
        ],
      },
    } as Condition;
    expect(matchFacet(lens, decoration, other)).toBeUndefined();
  });

  test('the most specific matching facet wins', () => {
    const general = {
      path: 'enrichments.value',
      where: { field: 'source', operator: 'equals', value: 'Salesforce' } as Condition,
      label: 'Salesforce',
    };
    const specific = {
      path: 'enrichments.value',
      where: {
        all: [
          { field: 'source', operator: 'equals', value: 'Salesforce' },
          { field: 'key', operator: 'equals', value: 'industry' },
        ],
      } as Condition,
      label: 'Salesforce Industry',
    };
    const both: Decoration = { facets: [general, specific] };
    expect(matchFacet(lens, both, savedReordered)).toBe(specific);
  });
});

describe('facet selectors — decoration-declared inner rows', () => {
  test('a matched facet exposes its selectors on the array node', () => {
    const cond = eavBlock([
      { field: 'source', operator: 'equals', value: 'Salesforce' },
      { field: 'key', operator: 'equals', value: 'industry' },
      { field: 'value', operator: 'equals', value: 'Manufacturing' },
    ]);
    const arr = (buildRoot(cond, lens, fields, 4, () => {}, { decoration }) as GroupNode)
      .children[0] as ArrayNode;
    expect(arr.hoist?.label).toBe('Salesforce');
    expect(arr.selectors).toEqual([{ field: 'key', label: 'Field', anyLabel: 'Any field' }]);
  });
});
