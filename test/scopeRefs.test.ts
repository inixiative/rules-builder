import { beforeEach, describe, expect, test } from 'bun:test';
import type { Condition, FieldMap } from '@inixiative/json-rules';
import {
  type ArrayNode,
  buildRoot,
  type GroupNode,
  type LeafNode,
} from '../src/builder/buildNodes';
import { describeModelFields, resolve } from '../src/schema/surface';

const map: FieldMap = {
  models: {
    User: {
      fields: {
        tier: { kind: 'scalar', type: 'String' },
        creditLimit: { kind: 'scalar', type: 'Float' },
        metadata: { kind: 'scalar', type: 'Json' },
        orders: { kind: 'object', type: 'Order', isList: true },
      },
    },
    Order: {
      fields: {
        total: { kind: 'scalar', type: 'Float' },
        status: { kind: 'enum', type: 'OrderStatus' },
        items: { kind: 'object', type: 'Item', isList: true },
      },
    },
    Item: {
      fields: {
        sku: { kind: 'scalar', type: 'String' },
        qty: { kind: 'scalar', type: 'Int' },
      },
    },
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
  }) as GroupNode;
};

const inOrders = (leaf: Record<string, unknown>): Condition => ({
  all: [
    {
      field: 'orders',
      arrayOperator: 'any',
      __id: 'a',
      condition: { all: [{ __id: 'l', ...leaf }] },
    },
  ],
});

const orderLeaf = (c: Condition): LeafNode =>
  ((build(c).children[0] as ArrayNode).condition as GroupNode).children[0] as LeafNode;

describe('scope refs — enclosing scopes on the descriptor', () => {
  beforeEach(() => {
    committed = undefined;
  });

  test('a root leaf has no enclosing scopes', () => {
    const leaf = build({ all: [{ field: 'tier', operator: 'equals', value: 'x', __id: 'l' }] })
      .children[0] as LeafNode;
    expect(leaf.scopes).toBeUndefined();
  });

  test('a leaf one array deep sees the root row as $$.', () => {
    const leaf = orderLeaf(inOrders({ field: 'total', operator: 'greaterThan', value: 1 }));
    expect(leaf.scopes?.map((s) => [s.prefix, s.label])).toEqual([['$$.', 'User']]);
    expect(leaf.scopes?.[0].options.map((o) => o.value)).toEqual(
      expect.arrayContaining(['$$.tier', '$$.creditLimit', '$$.orders']),
    );
  });

  test('two arrays deep: $$. is the order, $$$. the user', () => {
    const rule = inOrders({
      field: 'items',
      arrayOperator: 'any',
      condition: { all: [{ field: 'qty', operator: 'greaterThan', value: 1, __id: 'q' }] },
    });
    const items = ((build(rule).children[0] as ArrayNode).condition as GroupNode)
      .children[0] as ArrayNode;
    const leaf = (items.condition as GroupNode).children[0] as LeafNode;
    expect(leaf.scopes?.map((s) => [s.prefix, s.label])).toEqual([
      ['$$.', 'Order'],
      ['$$$.', 'User'],
    ]);
    expect(items.scopes?.map((s) => s.prefix)).toEqual(['$$.']);
  });

  test('path mode offers the current row as $. followed by the enclosing scopes', () => {
    const leaf = orderLeaf(
      inOrders({ field: 'total', operator: 'lessThan', path: '$$.creditLimit' }),
    );
    expect(leaf.value?.mode).toBe('path');
    expect(leaf.value?.path?.scopes.map((s) => [s.prefix, s.label])).toEqual([
      ['$.', 'Order'],
      ['$$.', 'User'],
    ]);
    const values = leaf.value?.path?.scopes.flatMap((s) => s.options.map((o) => o.value)) ?? [];
    expect(values).toEqual(expect.arrayContaining(['$.total', '$$.creditLimit']));
    // A path names a value: relations and lists are not offered.
    expect(values).not.toContain('$.items');
    expect(values).not.toContain('$$.orders');
  });
});

describe('scope refs — prefixed field on a leaf', () => {
  test('resolves against the ancestor: kind, operators, and in-situ validity', () => {
    const leaf = orderLeaf(inOrders({ field: '$$.tier', operator: 'equals', value: 'gold' }));
    expect(leaf.field?.value).toBe('$$.tier');
    expect(leaf.field?.valid).toBe(true);
    expect(leaf.value?.kind).toBe('String');
    expect(leaf.operator?.options.map((o) => o.value)).toContain('contains');
    expect(leaf.valid).toBe(true);
  });

  test('picking an ancestor field commits the prefixed name', () => {
    const leaf = orderLeaf(inOrders({ field: 'total', operator: 'greaterThan', value: 1 }));
    leaf.field?.set('$$.creditLimit');
    const written = (
      (committed as { all: Condition[] }).all[0] as { condition: { all: Condition[] } }
    ).condition.all[0];
    expect(written).toMatchObject({ field: '$$.creditLimit', operator: 'equals' });
  });

  test('a prefixed Json field keeps its sub-path seam', () => {
    const leaf = orderLeaf(
      inOrders({ field: '$$.metadata.theme', operator: 'equals', value: 'dark' }),
    );
    expect(leaf.field?.value).toBe('$$.metadata');
    expect(leaf.field?.subPath).toBe('theme');
    leaf.field?.setSubPath?.('mode');
    const written = (
      (committed as { all: Condition[] }).all[0] as { condition: { all: Condition[] } }
    ).condition.all[0];
    expect(written).toMatchObject({ field: '$$.metadata.mode' });
  });

  test('a prefixed field the ancestor does not have is invalid', () => {
    const leaf = orderLeaf(inOrders({ field: '$$.nope', operator: 'equals', value: 'x' }));
    expect(leaf.field?.valid).toBe(false);
    expect(leaf.valid).toBe(false);
  });
});

describe('scope refs — prefixed path validity is judged in situ', () => {
  test('$$. to a real ancestor field is valid', () => {
    const leaf = orderLeaf(
      inOrders({ field: 'total', operator: 'lessThan', path: '$$.creditLimit' }),
    );
    expect(leaf.valid).toBe(true);
  });

  test('$$$. past the root is invalid', () => {
    const leaf = orderLeaf(
      inOrders({ field: 'total', operator: 'lessThan', path: '$$$.creditLimit' }),
    );
    expect(leaf.valid).toBe(false);
  });

  test('$$. to a field the ancestor lacks is invalid', () => {
    const leaf = orderLeaf(inOrders({ field: 'total', operator: 'lessThan', path: '$$.nope' }));
    expect(leaf.valid).toBe(false);
  });
});

describe('scope refs — prefixed field on an array node', () => {
  test('iterates the ancestor collection and scopes its elements', () => {
    const rule = inOrders({
      field: '$$.orders',
      arrayOperator: 'any',
      condition: { all: [{ field: 'status', operator: 'equals', value: 'paid', __id: 's' }] },
    });
    const inner = ((build(rule).children[0] as ArrayNode).condition as GroupNode)
      .children[0] as ArrayNode;
    expect(inner.field.value).toBe('$$.orders');
    expect(inner.field.valid).toBe(true);
    expect(inner.relation?.modelName).toBe('Order');
    expect(inner.valid).toBe(true);
    const leaf = (inner.condition as GroupNode).children[0] as LeafNode;
    expect(leaf.valid).toBe(true);
    expect(leaf.scopes?.map((s) => [s.prefix, s.label])).toEqual([
      ['$$.', 'Order'],
      ['$$$.', 'User'],
    ]);
  });

  test('out of bounds on an array node is invalid', () => {
    const rule = inOrders({ field: '$$$.orders', arrayOperator: 'notEmpty' });
    const inner = ((build(rule).children[0] as ArrayNode).condition as GroupNode)
      .children[0] as ArrayNode;
    expect(inner.field.valid).toBe(false);
    expect(inner.valid).toBe(false);
  });
});
