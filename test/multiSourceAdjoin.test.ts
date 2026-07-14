import { describe, expect, test } from 'bun:test';
import {
  type Condition,
  check,
  createLens,
  exposedSurface,
  type FieldMap,
} from '@inixiative/json-rules';
import {
  type Decoration,
  describeFacets,
  matchFacet,
  validateDecoration,
} from '../src/schema/decoration';

// One relation (`customFields`) carrying rows from several integrations, split by
// a `system` slug into three tagged logical sources — System A / B / C. Same
// traversal, three sources, each with its own tag (label + icon). And because a
// facet is just a `where`-slice of the relation, the same relation can be adjoined
// repeatedly in one rule — one slice per system — and each evaluates independently.
const map: FieldMap = {
  models: {
    User: { fields: { customFields: { kind: 'object', type: 'CustomField', isList: true } } },
    CustomField: {
      fields: {
        system: { kind: 'scalar', type: 'String' }, // the integration / system slug
        key: { kind: 'scalar', type: 'String' },
        value: { kind: 'scalar', type: 'String' },
      },
    },
  },
};
const lens = exposedSurface(createLens({ maps: { app: map }, mapName: 'app', model: 'User' }));

const source = (system: string, label: string, icon: string): Decoration['facets'][number] => ({
  path: 'customFields.value',
  where: {
    all: [
      { field: 'system', operator: 'equals', value: system },
      { field: 'key', operator: 'equals', value: 'nps' },
    ],
  },
  kind: 'Int',
  label,
  icon,
});

const decoration: Decoration = {
  facets: [
    source('a', 'System A', '🔵'),
    source('b', 'System B', '🟢'),
    source('c', 'System C', '🟠'),
  ],
};

const sliceFor = (system: string, min: number) =>
  ({
    field: 'customFields',
    arrayOperator: 'any',
    condition: {
      all: [
        { field: 'system', operator: 'equals', value: system },
        { field: 'key', operator: 'equals', value: 'nps' },
        { field: 'value', operator: 'greaterThan', value: min },
      ],
    },
  }) as Condition;

const rows = (xs: [string, number][]) => ({
  customFields: xs.map(([system, value]) => ({ system, key: 'nps', value })),
});

describe('the same relation adjoined N times, split into tagged sources by a system slug', () => {
  test('three tagged sources over one relation are collision-free and each carries its own tag', () => {
    expect(validateDecoration(lens, decoration)).toEqual([]);
    const fields = describeFacets(lens, decoration);
    expect(fields.map((f) => [f.label, f.icon])).toEqual(
      expect.arrayContaining([
        ['System A', '🔵'],
        ['System B', '🟢'],
        ['System C', '🟠'],
      ]),
    );
  });

  test('each source seeds its own system slug as a leading condition', () => {
    for (const [system, label] of [
      ['a', 'System A'],
      ['b', 'System B'],
      ['c', 'System C'],
    ] as const) {
      const field = describeFacets(lens, decoration).find((f) => f.label === label);
      const seed = field?.seed as { condition: { all: Condition[] } };
      expect(seed.condition.all[0]).toMatchObject({ field: 'system', value: system });
      expect(seed.condition.all[1]).toMatchObject({ field: 'key', value: 'nps' });
    }
  });

  test('the relation adjoined three times — one slice per system — composes into one rule', () => {
    const rule = { all: [sliceFor('a', 5), sliceFor('b', 5), sliceFor('c', 5)] } as Condition;
    // every system must contribute a qualifying row
    expect(
      check(
        rule,
        rows([
          ['a', 9],
          ['b', 8],
          ['c', 7],
        ]),
      ),
    ).toBe(true);
    // one system missing -> the whole adjunction fails
    expect(
      check(
        rule,
        rows([
          ['a', 9],
          ['b', 8],
        ]),
      ),
    ).not.toBe(true);
    // System C present but below threshold -> fails on its own slice
    expect(
      check(
        rule,
        rows([
          ['a', 9],
          ['b', 8],
          ['c', 3],
        ]),
      ),
    ).not.toBe(true);
  });

  test('a single source evaluates only on its own system rows', () => {
    const rule = { all: [sliceFor('b', 5)] } as Condition;
    expect(check(rule, rows([['b', 9]]))).toBe(true);
    expect(check(rule, rows([['a', 9]]))).not.toBe(true);
  });

  test('rehydration recovers each system tag from its own slice', () => {
    expect(matchFacet(lens, decoration, sliceFor('a', 5))?.label).toBe('System A');
    expect(matchFacet(lens, decoration, sliceFor('b', 5))?.label).toBe('System B');
    expect(matchFacet(lens, decoration, sliceFor('c', 5))?.label).toBe('System C');
  });
});
