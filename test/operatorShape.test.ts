import { beforeEach, describe, expect, test } from 'bun:test';
import type { Condition, FieldMap } from '@inixiative/json-rules';
import { type ArrayNode, buildRoot, type LeafNode } from '../src/builder/buildNodes';
import { describeModelFields, resolve } from '../src/schema/surface';

const map: FieldMap = {
  models: {
    User: {
      fields: {
        tier: { kind: 'scalar', type: 'String', isRequired: false },
        score: { kind: 'scalar', type: 'Int' },
        lastLoginAt: { kind: 'scalar', type: 'DateTime' },
        orders: { kind: 'object', type: 'Order', isList: true },
      },
    },
    Order: { fields: { total: { kind: 'scalar', type: 'Float' } } },
  },
};

const lens = resolve({ maps: { app: map }, mapName: 'app', model: 'User' });
const fields = describeModelFields(lens, 'app', 'User');

let committed: Condition | undefined;
const build = (c: Condition) => {
  committed = undefined;
  return buildRoot(c, lens, fields, 4, (next) => {
    committed = next;
  });
};
const emitted = () => (committed as { all: Record<string, unknown>[] }).all[0];

const leafOf = (rule: Record<string, unknown>) =>
  build({ all: [rule] } as Condition).children[0] as LeafNode;

const aggRule = (over: Record<string, unknown> = {}): Condition =>
  ({
    all: [
      {
        field: 'orders',
        aggregate: { mode: 'sum', field: 'total' },
        operator: 'greaterThan',
        value: 1000,
        ...over,
      },
    ],
  }) as Condition;

describe('a leaf operator switch and its operand', () => {
  beforeEach(() => {
    committed = undefined;
  });

  test('scalar → range drops the operand', () => {
    leafOf({ field: 'score', operator: 'equals', value: 5 }).operator?.set('between');
    expect(emitted()).toEqual({ field: 'score', operator: 'between' });
  });

  test('scalar → list drops the operand', () => {
    leafOf({ field: 'tier', operator: 'equals', value: 'gold' }).operator?.set('in');
    expect(emitted()).toEqual({ field: 'tier', operator: 'in' });
  });

  test('range → scalar drops the operand', () => {
    leafOf({ field: 'score', operator: 'between', value: [1, 5] }).operator?.set('equals');
    expect(emitted()).toEqual({ field: 'score', operator: 'equals' });
  });

  test('a no-operand operator drops it', () => {
    leafOf({ field: 'tier', operator: 'equals', value: 'gold' }).operator?.set('isEmpty');
    expect(emitted()).toEqual({ field: 'tier', operator: 'isEmpty' });
  });

  test('a same-class switch keeps what the user typed', () => {
    leafOf({ field: 'score', operator: 'equals', value: 5 }).operator?.set('greaterThan');
    expect(emitted()).toEqual({ field: 'score', operator: 'greaterThan', value: 5 });

    leafOf({ field: 'tier', operator: 'equals', value: 'go' }).operator?.set('contains');
    expect(emitted()).toEqual({ field: 'tier', operator: 'contains', value: 'go' });
  });

  test('a date value and a date window are different operands', () => {
    leafOf({ field: 'lastLoginAt', dateOperator: 'before', value: '2024-01-01' }).operator?.set(
      'within',
    );
    expect(emitted()).toEqual({ field: 'lastLoginAt', dateOperator: 'within' });
  });

  test('a non-value source is dropped with the operand', () => {
    leafOf({ field: 'score', operator: 'equals', path: 'other.score' }).operator?.set('between');
    expect(emitted()).toEqual({ field: 'score', operator: 'between' });
  });

  test('an operator the catalog no longer knows still builds and can be switched away', () => {
    const leaf = leafOf({ field: 'score', operator: 'someLegacyOp', value: 5 });
    expect(leaf.value.shape).toBe('none');
    expect(() => leaf.operator?.set('equals')).not.toThrow();
    expect(emitted()).toEqual({ field: 'score', operator: 'equals', value: 5 });
  });
});

describe('an aggregate threshold switch and its operand', () => {
  beforeEach(() => {
    committed = undefined;
  });

  test('scalar → range drops the stale threshold', () => {
    const a = build(aggRule()).children[0] as ArrayNode;
    a.aggregate?.operator.set('between');
    expect(emitted().operator).toBe('between');
    expect(emitted().value).toBeUndefined();
  });

  test('range → scalar drops the stale threshold', () => {
    const a = build(aggRule({ operator: 'between', value: [1, 5] })).children[0] as ArrayNode;
    a.aggregate?.operator.set('greaterThanEquals');
    expect(emitted().operator).toBe('greaterThanEquals');
    expect(emitted().value).toBeUndefined();
  });

  test('a same-class switch keeps the threshold', () => {
    const a = build(aggRule()).children[0] as ArrayNode;
    a.aggregate?.operator.set('lessThanEquals');
    expect(emitted().operator).toBe('lessThanEquals');
    expect(emitted().value).toBe(1000);
  });

  test('an operator the catalog no longer knows still builds and can be switched away', () => {
    const a = build(aggRule({ operator: 'someLegacyOp' })).children[0] as ArrayNode;
    expect(a.aggregate?.value.shape).toBe('none');
    expect(() => a.aggregate?.operator.set('greaterThanEquals')).not.toThrow();
    expect(emitted().operator).toBe('greaterThanEquals');
  });
});
