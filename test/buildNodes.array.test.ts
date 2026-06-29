import { beforeEach, describe, expect, test } from 'bun:test';
import type { Condition, FieldMap } from '@inixiative/json-rules';
import { type ArrayNode, buildRoot, type GroupNode, type LeafNode } from '../src/builder/buildNodes';
import { describeModelFields, resolve } from '../src/schema/surface';

const map: FieldMap = {
  models: {
    User: {
      fields: {
        tier: { kind: 'scalar', type: 'String' },
        orders: { kind: 'object', type: 'Order', isList: true },
        account: { kind: 'object', type: 'Account' }, // to-one relation
      },
    },
    Order: {
      fields: {
        total: { kind: 'scalar', type: 'Float' },
        status: { kind: 'enum', type: 'OrderStatus' },
      },
    },
    Account: { fields: { name: { kind: 'scalar', type: 'String' } } },
  },
  enums: { OrderStatus: ['pending', 'paid'] },
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

const arrayRule = (over: Partial<Record<string, unknown>> = {}): Condition => ({
  all: [{ field: 'orders', arrayOperator: 'notEmpty', _id: 'a', ...over }],
});

describe('buildRoot — array nodes', () => {
  beforeEach(() => {
    committed = undefined;
  });

  test('a list field rule builds an array node, not a leaf', () => {
    const node = build(arrayRule()).children[0];
    expect(node.kind).toBe('array');
    const a = node as ArrayNode;
    expect(a.field.value).toBe('orders');
    expect(a.arrayOperator.value).toBe('notEmpty');
    expect(a.arrayOperator.options.map((o) => o.value)).toEqual(
      expect.arrayContaining(['any', 'all', 'none', 'atLeast', 'atMost', 'exactly', 'empty', 'notEmpty']),
    );
  });

  test('presence op (notEmpty): no count, no condition, but a filter sub-builder exists', () => {
    const a = build(arrayRule()).children[0] as ArrayNode;
    expect(a.count).toBeUndefined();
    expect(a.condition).toBeUndefined();
    expect(a.filter?.kind).toBe('group');
    expect(a.valid).toBe(true);
  });

  test('predicate op (any) exposes a condition sub-builder scoped to the related model', () => {
    const cond = arrayRule({
      arrayOperator: 'any',
      condition: {
        all: [{ field: 'total', operator: 'greaterThan', value: 100, _id: 'c' }],
      },
    });
    const a = build(cond).children[0] as ArrayNode;
    expect(a.relation).toEqual({ mapName: 'app', modelName: 'Order' });
    expect(a.condition?.kind).toBe('group');
    const inner = a.condition?.children[0] as LeafNode;
    expect(inner.kind).toBe('leaf');
    expect(inner.field.value).toBe('total');
    // the inner field picker offers the RELATED model's fields, not User's
    expect(inner.field.options.map((o) => o.value).sort()).toEqual(['status', 'total']);
    expect(inner.valid).toBe(true);
  });

  test('count op (atLeast) exposes a numeric count control; count.set commits', () => {
    const a = build(arrayRule({ arrayOperator: 'atLeast', count: 2 })).children[0] as ArrayNode;
    expect(a.count?.value).toBe(2);
    a.count?.set(5);
    const child = (committed as { all: Condition[] }).all[0] as Record<string, unknown>;
    expect(child.count).toBe(5);
    expect(child.arrayOperator).toBe('atLeast');
  });

  test('arrayOperator.set to a presence op drops count + condition', () => {
    const a = build(
      arrayRule({
        arrayOperator: 'atLeast',
        count: 2,
        condition: {
          all: [{ field: 'total', operator: 'greaterThan', value: 1 }],
        },
      }),
    ).children[0] as ArrayNode;
    a.arrayOperator.set('empty');
    const child = (committed as { all: Condition[] }).all[0] as Record<string, unknown>;
    expect(child.arrayOperator).toBe('empty');
    expect(child.count).toBeUndefined();
    expect(child.condition).toBeUndefined();
  });

  test('editing the condition sub-builder commits back into the array rule', () => {
    const cond = arrayRule({ arrayOperator: 'any', condition: { all: [] } });
    const a = build(cond).children[0] as ArrayNode;
    a.condition?.addRule();
    const child = (committed as { all: Condition[] }).all[0] as Record<string, unknown>;
    expect(child.arrayOperator).toBe('any');
    expect((child.condition as { all: unknown[] }).all).toHaveLength(1);
  });

  test('selecting a list field on a leaf converts it into an array rule', () => {
    const leafCond: Condition = {
      all: [{ field: 'tier', operator: 'equals', value: 'gold', _id: 'a' }],
    };
    const leaf = build(leafCond).children[0] as LeafNode;
    leaf.field.set('orders');
    const child = (committed as { all: Condition[] }).all[0] as Record<string, unknown>;
    expect(child.field).toBe('orders');
    expect(child.arrayOperator).toBeDefined();
    expect(child._id).toBe('a'); // identity preserved
  });

  test('to-one relations are excluded from the field picker (only scalars + lists)', () => {
    const node = build(arrayRule()).children[0] as ArrayNode;
    expect(node.field.options.map((o) => o.value).sort()).toEqual(['orders', 'tier']);
  });
});
