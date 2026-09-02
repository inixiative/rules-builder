import { afterEach, describe, expect, test } from 'bun:test';
import { type Condition, check, type FieldMap } from '@inixiative/json-rules';
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  type ArrayNode,
  buildRoot,
  type GroupNode,
  type LeafNode,
} from '../src/builder/buildNodes';
import { useRuleBuilder } from '../src/builder/useRuleBuilder';
import {
  type Decoration,
  type Facet,
  type FacetCondition,
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

const THRESHOLD_OPERATORS = ['greaterThanEquals', 'lessThanEquals', 'equals'] as const;

const rewardsBody = (threshold: Record<string, unknown>): FacetCondition =>
  ({
    field: 'rewards',
    aggregate: { mode: 'sum', field: 'amount' },
    ...threshold,
    condition: {
      all: [
        { field: 'createdAt', dateOperator: 'within', variable: { default: { this: 'year' } } },
        { field: 'status', operator: 'notEquals', value: 'rejected' },
      ],
    },
  }) as FacetCondition;

// The first consumer's card: the threshold's operator AND value are knobs, the
// window is a value knob, the status clause is identity.
const rewardsKnob: Facet = {
  label: 'Rewards Redeemed',
  condition: rewardsBody({
    operator: 'greaterThanEquals',
    variable: { operators: [...THRESHOLD_OPERATORS] },
  }),
};
const rewardsKnobLte: Facet = {
  label: 'Rewards Redeemed (lte default)',
  condition: rewardsBody({
    operator: 'lessThanEquals',
    variable: { operators: [...THRESHOLD_OPERATORS] },
  }),
};
const rewardsLocked: Facet = {
  label: 'Rewards Redeemed (locked)',
  condition: rewardsBody({ operator: 'greaterThanEquals', variable: {} }),
};

const tierKnob: Facet = {
  label: 'Tier',
  condition: {
    field: 'tier',
    operator: 'equals',
    variable: { options: ['gold', 'silver'], operators: ['equals', 'notEquals'] },
  },
};

const inactiveKnob: Facet = {
  label: 'Last Login',
  condition: {
    field: 'lastLoginAt',
    dateOperator: 'notWithin',
    variable: { default: { ago: { days: 30 } }, operators: ['within', 'notWithin'] },
  },
};

const savedRewards = (
  operator: string,
  value: unknown,
  window: unknown = { this: 'year' },
): Condition =>
  ({
    field: 'rewards',
    aggregate: { mode: 'sum', field: 'amount' },
    operator,
    value,
    condition: {
      all: [
        { field: 'createdAt', dateOperator: 'within', value: window },
        { field: 'status', operator: 'notEquals', value: 'rejected' },
      ],
    },
  }) as Condition;

describe('operators — the template', () => {
  test('a knob is still one slot; the seed keeps the template operator as the default', () => {
    expect(variableSlots(rewardsKnob.condition as FacetCondition).map((s) => s.path)).toEqual([
      [],
      ['condition', 0],
    ]);
    expect(presetSeed(rewardsKnob)).toEqual(presetSeed(rewardsLocked));
    expect((presetSeed(rewardsKnob) as { operator?: string }).operator).toBe('greaterThanEquals');
  });

  test('facetId erases the default operator at a knobbed slot — one id, a duplicate violation', () => {
    expect(facetId(rewardsKnob)).toBe(facetId(rewardsKnobLte));
    expect(validateDecoration(lens, { facets: [rewardsKnob, rewardsKnobLte] })).toEqual([
      expect.stringContaining('duplicate facet id'),
    ]);
  });

  test('a knob and a locked operator over one body are two ids', () => {
    expect(facetId(rewardsKnob)).not.toBe(facetId(rewardsLocked));
    expect(validateDecoration(lens, { facets: [rewardsKnob, rewardsLocked] })).toEqual([]);
  });
});

describe('operators — recognition', () => {
  test('a saved node with another operator at a knobbed slot wears the card', () => {
    const decoration: Decoration = { facets: [rewardsKnob, tierKnob, inactiveKnob] };
    expect(matchFacet(lens, decoration, savedRewards('lessThanEquals', 250))).toBe(rewardsKnob);
    expect(
      matchFacet(lens, decoration, { field: 'tier', operator: 'notEquals', value: 'gold' }),
    ).toBe(tierKnob);
    expect(
      matchFacet(lens, decoration, {
        field: 'lastLoginAt',
        dateOperator: 'within',
        value: { ago: { days: 7 } },
      }),
    ).toBe(inactiveKnob);
  });

  test('an operator outside the declared list still matches — shown untouched, like options', () => {
    expect(matchFacet(lens, { facets: [rewardsKnob] }, savedRewards('between', [10, 20]))).toBe(
      rewardsKnob,
    );
  });

  test('another operator at a LOCKED slot does not match', () => {
    const notWithinWindow = {
      ...(savedRewards('greaterThanEquals', 250) as Record<string, unknown>),
      condition: {
        all: [
          { field: 'createdAt', dateOperator: 'notWithin', value: { this: 'year' } },
          { field: 'status', operator: 'notEquals', value: 'rejected' },
        ],
      },
    } as Condition;
    expect(matchFacet(lens, { facets: [rewardsKnob] }, notWithinWindow)).toBeUndefined();
  });

  test('an out-of-list operator at a KNOBBED leaf slot still matches — on either operator key', () => {
    expect(
      matchFacet(
        lens,
        { facets: [tierKnob] },
        { field: 'tier', operator: 'contains', value: 'go' },
      ),
    ).toBe(tierKnob);
    expect(
      matchFacet(
        lens,
        { facets: [inactiveKnob] },
        { field: 'lastLoginAt', dateOperator: 'before', value: '2026-01-01' },
      ),
    ).toBe(inactiveKnob);
  });

  test('a locked-operator preset beats a knobbed one on the default operator, regardless of order', () => {
    const saved = savedRewards('greaterThanEquals', 250);
    expect(matchFacet(lens, { facets: [rewardsKnob, rewardsLocked] }, saved)).toBe(rewardsLocked);
    expect(matchFacet(lens, { facets: [rewardsLocked, rewardsKnob] }, saved)).toBe(rewardsLocked);
    expect(
      matchFacet(
        lens,
        { facets: [rewardsLocked, rewardsKnob] },
        savedRewards('lessThanEquals', 250),
      ),
    ).toBe(rewardsKnob);
  });
});

describe('operators — validateDecoration', () => {
  test('knobbed presets over admitted operators are clean', () => {
    expect(validateDecoration(lens, { facets: [rewardsKnob, tierKnob, inactiveKnob] })).toEqual([]);
  });

  test('a leaf knob must list operators the field kind offers', () => {
    const bad: Facet = {
      label: 'Tier',
      condition: {
        field: 'tier',
        operator: 'equals',
        variable: { operators: ['equals', 'before'] },
      },
    };
    expect(validateDecoration(lens, { facets: [bad] })).toEqual([
      expect.stringContaining("'before'"),
    ]);
  });

  test('an aggregate knob must list threshold comparisons', () => {
    const bad: Facet = {
      label: 'Rewards',
      condition: rewardsBody({
        operator: 'greaterThanEquals',
        variable: { operators: ['greaterThanEquals', 'contains', 'notBetween'] },
      }),
    };
    expect(validateDecoration(lens, { facets: [bad] })).toEqual([
      expect.stringContaining("'contains'"),
      expect.stringContaining("'notBetween'"),
    ]);
  });

  test('a nested slot is checked in its element scope', () => {
    const bad: Facet = {
      label: 'Rewards',
      condition: {
        field: 'rewards',
        aggregate: { mode: 'sum', field: 'amount' },
        operator: 'greaterThanEquals',
        variable: {},
        condition: {
          all: [
            {
              field: 'createdAt',
              dateOperator: 'within',
              variable: {
                default: { this: 'year' },
                operators: ['within', 'notWithin', 'contains'],
              },
            },
            { field: 'status', operator: 'notEquals', value: 'rejected' },
          ],
        },
      } as FacetCondition,
    };
    expect(validateDecoration(lens, { facets: [bad] })).toEqual([
      expect.stringContaining("'contains'"),
    ]);
  });

  test('an unknown operator is a violation, not a crash — even beside a default', () => {
    const typo: Facet = {
      label: 'Tier',
      condition: {
        field: 'tier',
        operator: 'equals',
        variable: { default: 'gold', operators: ['equals', 'equls'] },
      },
    };
    expect(() => validateDecoration(lens, { facets: [typo] })).not.toThrow();
    expect(validateDecoration(lens, { facets: [typo] })).toEqual([
      expect.stringContaining("'equls'"),
    ]);
  });

  test('a no-operand operator cannot share a slot with a value default or options', () => {
    const withDefault: Facet = {
      label: 'Tier',
      condition: {
        field: 'tier',
        operator: 'equals',
        variable: { default: 'gold', operators: ['equals', 'isEmpty'] },
      },
    };
    const withOptions: Facet = {
      label: 'Tier 2',
      condition: {
        field: 'tier',
        operator: 'equals',
        variable: { options: ['gold'], operators: ['equals', 'isEmpty'] },
      },
    };
    const openSlot: Facet = {
      label: 'Tier 3',
      condition: {
        field: 'tier',
        operator: 'equals',
        variable: { operators: ['equals', 'isEmpty'] },
      },
    };
    expect(validateDecoration(lens, { facets: [withDefault] })).toEqual([
      expect.stringContaining("'isEmpty'"),
    ]);
    expect(validateDecoration(lens, { facets: [withOptions] })).toEqual([
      expect.stringContaining("'isEmpty'"),
    ]);
    expect(validateDecoration(lens, { facets: [openSlot] })).toEqual([]);
  });
});

describe('operators — the built tree', () => {
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

  test('a knobbed slot exposes an operator control limited to the declared list; a locked slot has none', () => {
    const root = build(
      { all: [savedRewards('greaterThanEquals', 100)] },
      { facets: [rewardsKnob] },
    ) as GroupNode;
    const node = root.children[0] as ArrayNode;
    expect(node.atomic).toBe(true);
    const [threshold, window] = node.variables ?? [];
    expect(threshold?.operator?.value).toBe('greaterThanEquals');
    expect(threshold?.operator?.options.map((o) => o.value)).toEqual([...THRESHOLD_OPERATORS]);
    expect(window?.operator).toBeUndefined();
  });

  test('switching the knob commits the operator; a same-shape switch keeps the value', () => {
    const root = build(
      { all: [savedRewards('greaterThanEquals', 100)] },
      { facets: [rewardsKnob] },
    ) as GroupNode;
    const node = root.children[0] as ArrayNode;
    node.variables?.[0].operator?.set('lessThanEquals');
    const rule = (committed as { all: Record<string, unknown>[] }).all[0];
    expect(rule.operator).toBe('lessThanEquals');
    expect(rule.value).toBe(100);
    expect(matchFacet(lens, { facets: [rewardsKnob] }, rule as Condition)).toBe(rewardsKnob);
  });

  test('a scalar → range switch on an aggregate threshold drops the stale operand', () => {
    const root = build(
      { all: [savedRewards('greaterThanEquals', 100)] },
      { facets: [rewardsKnob] },
    ) as GroupNode;
    const node = root.children[0] as ArrayNode;
    node.aggregate?.operator.set('between');
    const rule = (committed as { all: Record<string, unknown>[] }).all[0];
    expect(rule.operator).toBe('between');
    expect(rule.value).toBeUndefined();
  });

  test('a scalar → range switch on a LEAF knob drops the stale operand too', () => {
    const tierRange: Facet = {
      label: 'Tier range',
      condition: {
        field: 'tier',
        operator: 'equals',
        variable: { default: 'gold', operators: ['equals', 'between'] },
      },
    };
    const root = build(
      { all: [{ field: 'tier', operator: 'equals', value: 'gold' }] },
      { facets: [tierRange] },
    ) as GroupNode;
    const node = root.children[0] as LeafNode;
    expect(node.atomic).toBe(true);
    node.variables?.[0].operator?.set('between');
    const rule = (committed as { all: Record<string, unknown>[] }).all[0];
    expect(rule).toEqual({ field: 'tier', operator: 'between' });
  });

  test('a saved aggregate with an operator the engine no longer knows can still be switched away', () => {
    const root = build(
      { all: [savedRewards('someLegacyOp', 100)] },
      { facets: [rewardsKnob] },
    ) as GroupNode;
    const node = root.children[0] as ArrayNode;
    expect(() => node.aggregate?.operator.set('equals')).not.toThrow();
    const rule = (committed as { all: Record<string, unknown>[] }).all[0];
    expect(rule.operator).toBe('equals');
    expect(rule.value).toBeUndefined();
  });

  test('a saved operator outside the list stays selectable', () => {
    const root = build(
      { all: [savedRewards('between', [10, 20])] },
      { facets: [rewardsKnob] },
    ) as GroupNode;
    const node = root.children[0] as ArrayNode;
    expect(node.atomic).toBe(true);
    expect(node.variables?.[0].operator?.value).toBe('between');
    expect(node.variables?.[0].operator?.options.map((o) => o.value)).toEqual([
      ...THRESHOLD_OPERATORS,
      'between',
    ]);
  });

  test('a leaf knob wraps the leaf operator control; a date knob writes dateOperator', () => {
    const root = build(
      { all: [{ field: 'lastLoginAt', dateOperator: 'notWithin', value: { ago: { days: 30 } } }] },
      { facets: [inactiveKnob] },
    ) as GroupNode;
    const node = root.children[0] as LeafNode;
    expect(node.atomic).toBe(true);
    expect(node.variables?.[0].operator?.options.map((o) => o.value)).toEqual([
      'within',
      'notWithin',
    ]);
    node.variables?.[0].operator?.set('within');
    const rule = (committed as { all: Record<string, unknown>[] }).all[0];
    expect(rule).toEqual({
      field: 'lastLoginAt',
      dateOperator: 'within',
      value: { ago: { days: 30 } },
    });
  });
});

describe('operators — through the hook', () => {
  test('pick → fill → turn the operator knob: still the card, still valid, the engine flips', () => {
    const decoration: Decoration = { facets: [rewardsKnob] };
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
    act(() => node.variables?.[0].value.set(100));
    node = (result.current.root as GroupNode).children[0] as ArrayNode;
    act(() => node.variables?.[0].operator?.set('lessThanEquals'));
    node = (result.current.root as GroupNode).children[0] as ArrayNode;

    expect(node.atomic).toBe(true);
    expect(node.hoist?.label).toBe('Rewards Redeemed');
    expect(node.variables?.[0].operator?.value).toBe('lessThanEquals');
    expect(result.current.validate('check').ok).toBe(true);

    const emitted = result.current.value;
    const now = new Date();
    const run = (rewards: Record<string, unknown>[]) => check(emitted, { rewards }, { now });
    expect(run([{ amount: 150, createdAt: now.toISOString(), status: 'paid' }])).not.toBe(true);
    expect(run([{ amount: 50, createdAt: now.toISOString(), status: 'paid' }])).toBe(true);
  });
});
