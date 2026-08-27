import { afterEach, describe, expect, test } from 'bun:test';
import { type Condition, check, checkRuleAgainstLens, type FieldMap } from '@inixiative/json-rules';
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  type ArrayNode,
  buildRoot,
  type GroupNode,
  type LeafNode,
  type ValueControl,
} from '../src/builder/buildNodes';
import { useRuleBuilder } from '../src/builder/useRuleBuilder';
import {
  type Decoration,
  describeFacets,
  type Facet,
  facetId,
  matchFacet,
  presetSeed,
  validateDecoration,
  variableSlots,
} from '../src/schema/decoration';
import { describeModelFields, resolve } from '../src/schema/surface';

afterEach(cleanup);

const map: FieldMap = {
  models: {
    User: {
      fields: {
        tier: { kind: 'scalar', type: 'String', values: ['gold', 'silver'] },
        lastLoginAt: { kind: 'scalar', type: 'DateTime', isRequired: false },
        rewards: { kind: 'object', type: 'Reward', isList: true },
      },
    },
    Reward: {
      fields: {
        amount: { kind: 'scalar', type: 'Int' },
        createdAt: { kind: 'scalar', type: 'DateTime' },
        status: { kind: 'enum', type: 'RewardStatus' },
      },
    },
  },
  enums: { RewardStatus: ['pending', 'paid', 'rejected'] },
};
const source = { maps: { app: map }, mapName: 'app', model: 'User' };
const lens = resolve(source);
const fields = describeModelFields(lens, 'app', 'User');

// The first consumer's shape: an aggregate threshold left OPEN, a window variable
// with a default, and a locked identity clause.
const rewardsTemplate = {
  field: 'rewards',
  aggregate: { mode: 'sum', field: 'amount' },
  operator: 'greaterThanEquals',
  variable: {},
  condition: {
    all: [
      { field: 'createdAt', dateOperator: 'within', variable: { default: { this: 'year' } } },
      { field: 'status', operator: 'notEquals', value: 'rejected' },
    ],
  },
} as unknown as Condition;
const rewards: Facet = { label: 'Rewards Redeemed', condition: rewardsTemplate };

const inactive: Facet = {
  label: 'Inactive',
  condition: {
    field: 'lastLoginAt',
    dateOperator: 'notWithin',
    variable: {
      default: { ago: { days: 30 } },
      options: [{ ago: { days: 30 } }, { ago: { days: 90 } }],
    },
  } as unknown as Condition,
};

const goldFixed: Facet = {
  label: 'Gold',
  condition: { field: 'tier', operator: 'equals', value: 'gold' },
};
const anyTier: Facet = {
  label: 'Tier',
  condition: {
    field: 'tier',
    operator: 'equals',
    variable: { options: ['gold', 'silver'] },
  } as unknown as Condition,
};

describe('variables — the template', () => {
  test('variableSlots lists every slot by builder path', () => {
    expect(variableSlots(rewardsTemplate)).toEqual([
      { path: [], variable: {} },
      { path: ['condition', 0], variable: { default: { this: 'year' } } },
    ]);
    expect(variableSlots(goldFixed.condition as Condition)).toEqual([]);
  });

  test('presetSeed fills defaults and omits the value-source key on an open slot', () => {
    expect(presetSeed(rewards)).toEqual({
      field: 'rewards',
      aggregate: { mode: 'sum', field: 'amount' },
      operator: 'greaterThanEquals',
      condition: {
        all: [
          { field: 'createdAt', dateOperator: 'within', value: { this: 'year' } },
          { field: 'status', operator: 'notEquals', value: 'rejected' },
        ],
      },
    });
    expect(presetSeed(inactive)).toEqual({
      field: 'lastLoginAt',
      dateOperator: 'notWithin',
      value: { ago: { days: 30 } },
    });
  });

  test('describeFacets seeds the picker with the instantiated condition', () => {
    const [entry] = describeFacets(lens, { facets: [inactive] });
    expect(entry.seed).toEqual(presetSeed(inactive));
  });

  test('facetId erases the default — one comparator for id and recognition', () => {
    const withDefault: Facet = {
      label: 'Tier',
      condition: {
        field: 'tier',
        operator: 'equals',
        variable: { default: 'gold' },
      } as unknown as Condition,
    };
    expect(facetId(withDefault)).toBe(facetId(anyTier));
    expect(facetId(withDefault)).not.toBe(facetId(goldFixed));
    expect(validateDecoration(lens, { facets: [withDefault, anyTier] })).toEqual([
      expect.stringContaining('duplicate facet id'),
    ]);
  });
});

describe('variables — recognition', () => {
  const decoration: Decoration = { facets: [goldFixed, anyTier, rewards, inactive] };

  test('a saved node with any value at the slot wears the card', () => {
    expect(
      matchFacet(lens, decoration, { field: 'tier', operator: 'equals', value: 'silver' }),
    ).toBe(anyTier);
    expect(
      matchFacet(lens, decoration, {
        field: 'lastLoginAt',
        dateOperator: 'notWithin',
        value: { ago: { days: 90 } },
      }),
    ).toBe(inactive);
    expect(
      matchFacet(lens, decoration, {
        field: 'rewards',
        aggregate: { mode: 'sum', field: 'amount' },
        operator: 'greaterThanEquals',
        value: 250,
        condition: {
          all: [
            { field: 'createdAt', dateOperator: 'within', value: { last: 'year' } },
            { field: 'status', operator: 'notEquals', value: 'rejected' },
          ],
        },
      } as Condition),
    ).toBe(rewards);
  });

  test('an open slot (no value source yet) is still the card — a fresh insert renders faceted', () => {
    expect(matchFacet(lens, decoration, { field: 'tier', operator: 'equals' } as Condition)).toBe(
      anyTier,
    );
  });

  test('a path or bind at the slot is a filled slot too', () => {
    expect(matchFacet(lens, decoration, { field: 'tier', operator: 'equals', bind: 'tier' })).toBe(
      anyTier,
    );
  });

  test('fewest wildcard slots wins, regardless of facet order', () => {
    const gold = { field: 'tier', operator: 'equals', value: 'gold' } as Condition;
    expect(matchFacet(lens, { facets: [anyTier, goldFixed] }, gold)).toBe(goldFixed);
    expect(matchFacet(lens, { facets: [goldFixed, anyTier] }, gold)).toBe(goldFixed);
  });

  test('anything outside the slot must match exactly', () => {
    expect(
      matchFacet(lens, decoration, { field: 'tier', operator: 'notEquals', value: 'gold' }),
    ).toBeUndefined();
    expect(
      matchFacet(lens, decoration, {
        field: 'rewards',
        aggregate: { mode: 'sum', field: 'amount' },
        operator: 'greaterThanEquals',
        value: 250,
        condition: {
          all: [{ field: 'createdAt', dateOperator: 'within', value: { last: 'year' } }],
        },
      } as Condition),
    ).toBeUndefined();
  });
});

describe('variables — validateDecoration', () => {
  test('the instantiated template is validated against the lens; an open slot passes', () => {
    expect(validateDecoration(lens, { facets: [rewards, inactive, anyTier] })).toEqual([]);
  });

  test('options must be admitted by the lens', () => {
    const bad: Facet = {
      label: 'Tier',
      condition: {
        field: 'tier',
        operator: 'equals',
        variable: { options: ['gold', 'platinum'] },
      } as unknown as Condition,
    };
    expect(validateDecoration(lens, { facets: [bad] })).toEqual([
      expect.stringContaining('"platinum"'),
    ]);
  });

  test('selectors and a preset condition cannot coexist', () => {
    const facet: Facet = { ...anyTier, selectors: [{ field: 'tier' }] };
    expect(validateDecoration(lens, { facets: [facet] })).toEqual([
      expect.stringContaining('selectors'),
    ]);
  });
});

describe('variables — the built tree', () => {
  let committed: Condition | undefined;
  const build = (c: Condition, decoration: Decoration) => {
    committed = undefined;
    return buildRoot(
      c,
      lens,
      fields,
      4,
      (next) => {
        committed = next;
      },
      { decoration },
    );
  };

  test('an aggregate preset is recognized and exposes one control per variable', () => {
    const decoration: Decoration = { facets: [rewards] };
    const root = build({ all: [presetSeed(rewards)] }, decoration) as GroupNode;
    const node = root.children[0] as ArrayNode;
    expect(node.atomic).toBe(true);
    expect(node.hoist?.label).toBe('Rewards Redeemed');
    expect(node.variables?.map((v) => v.path)).toEqual([[], ['condition', 0]]);

    const [threshold, window] = node.variables ?? [];
    expect(threshold.label).toBe('amount');
    expect(threshold.value.current).toBeUndefined();
    threshold.value.set(250);
    expect((committed as { all: Condition[] }).all[0]).toMatchObject({ value: 250 });

    expect(window.field).toBe('createdAt');
    expect(window.value.current).toEqual({ this: 'year' });
    expect(window.value.shape).toBe('dateWindow');
    window.value.set({ last: 'year' });
    expect(
      ((committed as { all: Condition[] }).all[0] as { condition: { all: Condition[] } }).condition
        .all[0],
    ).toMatchObject({
      value: { last: 'year' },
    });
  });

  test('a leaf preset exposes its own value control and the variable options', () => {
    const decoration: Decoration = { facets: [inactive] };
    const root = build(presetSeed(inactive), decoration) as LeafNode;
    expect(root.atomic).toBe(true);
    const [slot] = root.variables ?? [];
    expect(slot.path).toEqual([]);
    expect(slot.options?.map((o) => o.value)).toEqual([
      { ago: { days: 30 } },
      { ago: { days: 90 } },
    ]);
    expect((slot.value as ValueControl).mode).toBe('value');
    slot.value.set({ ago: { days: 90 } });
    expect(committed).toEqual({
      field: 'lastLoginAt',
      dateOperator: 'notWithin',
      value: { ago: { days: 90 } },
    });
  });

  test('a zero-variable preset is the degenerate case — atomic, no variables', () => {
    const root = build(
      { all: [goldFixed.condition as Condition] },
      { facets: [goldFixed] },
    ) as GroupNode;
    const node = root.children[0] as LeafNode;
    expect(node.atomic).toBe(true);
    expect(node.variables).toEqual([]);
  });
});

describe('variables — through the hook', () => {
  test('pick → inserted with defaults, faceted at once, tuned through the variable, evaluates', () => {
    const decoration: Decoration = { facets: [rewards] };
    const { result } = renderHook(() =>
      useRuleBuilder({
        source,
        decoration,
        defaultValue: { all: [{ field: 'tier', operator: 'equals', value: 'gold' }] },
      }),
    );
    const row = (result.current.root as GroupNode).children[0] as LeafNode;
    const opt = row.field?.options.find((o) => o.label === 'Rewards Redeemed');
    if (!opt) throw new Error('preset not offered');
    act(() => row.field?.set(opt.value));

    let node = (result.current.root as GroupNode).children[0] as ArrayNode;
    expect(node.atomic).toBe(true);
    expect(node.variables?.length).toBe(2);
    // open threshold: not yet a valid rule
    expect(result.current.validate('check').ok).toBe(false);

    act(() => node.variables?.[0].value.set(100));
    node = (result.current.root as GroupNode).children[0] as ArrayNode;
    expect(node.atomic).toBe(true);
    expect(result.current.validate('check').ok).toBe(true);

    const emitted = result.current.value;
    expect(checkRuleAgainstLens(emitted, result.current.lens).ok).toBe(true);
    const now = new Date();
    const thisYear = now.toISOString();
    const run = (rewards: Record<string, unknown>[]) => check(emitted, { rewards }, { now });
    expect(run([{ amount: 150, createdAt: thisYear, status: 'paid' }])).toBe(true);
    expect(run([{ amount: 150, createdAt: thisYear, status: 'rejected' }])).not.toBe(true);
    expect(run([{ amount: 50, createdAt: thisYear, status: 'paid' }])).not.toBe(true);
  });
});
