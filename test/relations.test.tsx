import { afterEach, describe, expect, test } from 'bun:test';
import { type Condition, type FieldMap, validateRuleInLens } from '@inixiative/json-rules';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ArrayNode, GroupNode, LeafNode } from '../src/builder/buildNodes';
import { useRuleBuilder } from '../src/builder/useRuleBuilder';
import { type Decoration, validateDecoration } from '../src/schema/decoration';
import { type RuleBuilderSource, resolve } from '../src/schema/surface';

// json-rules 3.4: a relation is a field, off until the first narrowing turns it on. The
// builder offers, gates, coerces and describes against that narrowed lens — never against
// the projected surface, which is a bare lens and turns no relation on.

afterEach(cleanup);

const map: FieldMap = {
  models: {
    User: {
      fields: {
        name: { kind: 'scalar', type: 'String' },
        orders: { kind: 'object', type: 'Order', isList: true },
        account: { kind: 'object', type: 'Account' },
        posts: { kind: 'object', type: 'Post', isList: true },
      },
    },
    Order: {
      fields: {
        total: { kind: 'scalar', type: 'Float' },
        placedAt: { kind: 'scalar', type: 'DateTime' },
        items: { kind: 'object', type: 'Item', isList: true },
        user: { kind: 'object', type: 'User' },
      },
    },
    Item: {
      fields: {
        sku: { kind: 'scalar', type: 'String' },
        qty: { kind: 'scalar', type: 'Int' },
      },
    },
    Account: {
      fields: {
        industry: { kind: 'scalar', type: 'String' },
        owner: { kind: 'object', type: 'User' },
      },
    },
    Post: { fields: { title: { kind: 'scalar', type: 'String' } } },
  },
};

// orders (and items below them) and account are on; posts, Order.user and Account.owner are off.
const source: RuleBuilderSource = {
  maps: { app: map },
  mapName: 'app',
  model: 'User',
  narrowing: { root: { relations: { orders: { relations: { items: {} } }, account: {} } } },
};

const bigOrders: Condition = {
  field: 'orders',
  arrayOperator: 'any',
  condition: { all: [{ field: 'total', operator: 'greaterThan', value: 100 }] },
};

const rootOf = (c: Condition, decoration?: Decoration, src = source) =>
  renderHook(() => useRuleBuilder({ source: src, defaultValue: c, decoration })).result;

const optionValues = (node: { options: { value: string }[] } | undefined) =>
  (node?.options ?? []).map((o) => o.value).sort();

describe('relations the narrowing turns on are offered and validate', () => {
  test('the root picker offers the list relations turned on, and no relation left off', () => {
    const root = rootOf({ all: [{ field: 'name', operator: 'equals', value: 'x' }] }).current
      .root as GroupNode;
    const leaf = root.children[0] as LeafNode;
    // `account` is on but to-one: reached through a dotted path or a branch, never picked bare.
    expect(optionValues(leaf.field)).toEqual(['name', 'orders']);
  });

  test('an array rule through an on relation is valid, and its element scope offers the nested relation turned on there', () => {
    const result = rootOf({ all: [bigOrders] });
    const node = (result.current.root as GroupNode).children[0] as ArrayNode;
    expect(node.valid).toBe(true);
    expect(node.relation).toEqual({ mapName: 'app', modelName: 'Order' });
    const total = node.condition?.children[0] as LeafNode;
    expect(total.valid).toBe(true);
    // Order at `orders`: its columns and `items` (turned on below orders) — not `user` (off).
    expect(optionValues(total.field)).toEqual(['items', 'placedAt', 'total']);
  });

  test('a rule two relations deep validates in situ', () => {
    const deep: Condition = {
      field: 'orders',
      arrayOperator: 'any',
      condition: {
        all: [
          {
            field: 'items',
            arrayOperator: 'any',
            condition: { all: [{ field: 'qty', operator: 'greaterThan', value: 2 }] },
          },
        ],
      },
    };
    const result = rootOf({ all: [deep] });
    const orders = (result.current.root as GroupNode).children[0] as ArrayNode;
    const items = orders.condition?.children[0] as ArrayNode;
    expect(items.valid).toBe(true);
    expect(optionValues((items.condition?.children[0] as LeafNode).field)).toEqual(['qty', 'sku']);
    expect(validateRuleInLens(result.current.value, result.current.lens).ok).toBe(true);
  });

  test('a dotted path through an on to-one relation is a valid leaf', () => {
    const result = rootOf({
      all: [{ field: 'account.industry', operator: 'equals', value: 'Retail' }],
    });
    const leaf = (result.current.root as GroupNode).children[0] as LeafNode;
    expect(leaf.valid).toBe(true);
  });

  test('emission is coerced and described against the narrowed lens, relation paths included', () => {
    const result = rootOf({ all: [bigOrders] });
    const emitted = result.current.value as { all: Record<string, unknown>[] };
    const inner = (emitted.all[0].condition as { all: Record<string, unknown>[] }).all[0];
    expect(inner.coerceType).toBe('Float');
    expect(result.current.describe().errors).toEqual([]);
  });
});

describe('a relation the narrowing leaves off', () => {
  test('is not offered at the root or in an element scope', () => {
    const result = rootOf({ all: [bigOrders] });
    const node = (result.current.root as GroupNode).children[0] as ArrayNode;
    expect(optionValues(node.field)).not.toContain('posts');
    const total = node.condition?.children[0] as LeafNode;
    expect(optionValues(total.field)).not.toContain('user');
  });

  test('a saved rule crossing it is invalid, at the field', () => {
    const result = rootOf({
      all: [{ field: 'posts', arrayOperator: 'any', condition: { all: [] } }],
    });
    const node = (result.current.root as GroupNode).children[0] as ArrayNode;
    expect(node.field.valid).toBe(false);
    expect(node.valid).toBe(false);
  });

  test('a bare source turns nothing on: only the anchor columns', () => {
    const bare = { ...source, narrowing: undefined };
    const result = rootOf({ all: [bigOrders] }, undefined, bare);
    const node = (result.current.root as GroupNode).children[0] as ArrayNode;
    expect(node.valid).toBe(false);
    const leaf = renderHook(() =>
      useRuleBuilder({
        source: bare,
        defaultValue: { all: [{ field: 'name', operator: 'equals', value: 'x' }] },
      }),
    ).result.current.root as GroupNode;
    expect(optionValues((leaf.children[0] as LeafNode).field)).toEqual(['name']);
  });
});

describe('presets through relations', () => {
  const bigSpender = { label: 'Big spender', condition: bigOrders };

  test('a preset through an on relation validates and inserts as a valid atomic node', () => {
    const decoration: Decoration = { facets: [bigSpender] };
    expect(validateDecoration(resolve(source), decoration)).toEqual([]);
    const result = rootOf({ all: [{ field: 'name', operator: 'equals', value: 'x' }] }, decoration);
    const leaf = (result.current.root as GroupNode).children[0] as LeafNode;
    const option = leaf.field?.options.find((o) => o.label === 'Big spender');
    if (!option) throw new Error('preset not offered');
    act(() => leaf.field?.set(option.value));
    const node = (result.current.root as GroupNode).children[0] as ArrayNode;
    expect(node.atomic).toBe(true);
    expect(node.valid).toBe(true);
  });

  test('a preset through an off relation is reported against the narrowed lens', () => {
    const decoration: Decoration = {
      facets: [
        {
          label: 'Posted',
          condition: { field: 'posts', arrayOperator: 'any', condition: { all: [] } },
        },
      ],
    };
    expect(validateDecoration(resolve(source), decoration)).toEqual([
      "preset 'Posted' is not a valid rule against the lens",
    ]);
  });

  test('a per-model preset is gated in situ, at each visit its scope is built on', () => {
    const multiItem: Decoration = {
      facets: [],
      models: {
        Order: [
          {
            label: 'Multi-item',
            condition: {
              field: 'items',
              arrayOperator: 'atLeast',
              count: 2,
              condition: { all: [] },
            },
          },
        ],
      },
    };
    expect(validateDecoration(resolve(source), multiItem)).toEqual([]);
    // Items off below orders: the same preset is refused there.
    const noItems = { ...source, narrowing: { root: { relations: { orders: {} } } } };
    expect(validateDecoration(resolve(noItems), multiItem)).toEqual([
      "models['Order'] @ app:Order (User.orders): preset 'Multi-item' is not a valid rule against the lens",
    ]);
  });

  test('a path facet through an off relation does not resolve', () => {
    expect(
      validateDecoration(resolve(source), { facets: [{ path: 'posts.title', label: 'Post' }] }),
    ).toEqual(["facet 'posts.title' does not resolve against the lens"]);
  });
});

describe('model-default relations grow a tree', () => {
  const defaults = {
    app: { models: { User: { relations: { orders: {} } }, Order: { relations: { user: {} } } } },
  };
  const backEdge: Condition = {
    field: 'orders',
    arrayOperator: 'any',
    condition: { all: [{ field: 'user.name', operator: 'equals', value: 'x' }] },
  };
  const ordersNode = (narrowing: RuleBuilderSource['narrowing']) =>
    (rootOf({ all: [backEdge] }, undefined, { ...source, narrowing }).current.root as GroupNode)
      .children[0] as ArrayNode;

  test('a second reach of a model is off in the tree, and offered once spelled', () => {
    // Order.user leads back to User, the anchor: not reached again by the defaults.
    const tree = ordersNode({ mapDefaults: defaults });
    expect(tree.valid).toBe(false);
    expect(
      resolve({ ...source, narrowing: { mapDefaults: defaults } }).visit('User.orders.user'),
    ).toBeUndefined();

    const spelled = ordersNode({
      mapDefaults: defaults,
      root: { relations: { orders: { relations: { user: {} } } } },
    });
    expect(spelled.valid).toBe(true);
    expect((spelled.condition?.children[0] as LeafNode).valid).toBe(true);
  });
});

describe('fetched source values are held per path', () => {
  const sourced: RuleBuilderSource = {
    maps: {
      app: {
        models: {
          User: {
            fields: {
              orders: { kind: 'object', type: 'Order', isList: true },
              org: { kind: 'object', type: 'Org' },
            },
          },
          Org: { fields: { orders: { kind: 'object', type: 'Order', isList: true } } },
          Order: {
            fields: {
              status: {
                kind: 'scalar',
                type: 'String',
                options: [{ value: 'open' }, { value: 'closed' }, { value: 'void' }],
              },
            },
          },
        },
      },
    },
    mapName: 'app',
    model: 'User',
    narrowing: {
      root: {
        relations: {
          orders: { sources: { status: true } },
          org: { relations: { orders: {} } },
        },
      },
    },
  };
  const sourceValues = [
    {
      path: 'User.orders',
      mapName: 'app',
      model: 'Order',
      field: 'status',
      options: [{ value: 'open' }, { value: 'platinum' }],
    },
  ];
  const statusLeaf = (list: string, value: string) => {
    const result = renderHook(() =>
      useRuleBuilder({
        source: sourced,
        sourceValues,
        defaultValue: {
          all: [
            {
              field: list,
              arrayOperator: 'any',
              condition: { all: [{ field: 'status', operator: 'equals', value }] },
            },
          ],
        },
      }),
    ).result;
    return ((result.current.root as GroupNode).children[0] as ArrayNode).condition
      ?.children[0] as LeafNode;
  };

  test('the sourced path offers and admits only its fetched values, cut to what the schema allows', () => {
    expect(statusLeaf('orders', 'open').value?.options?.map((o) => o.value)).toEqual(['open']);
    expect(statusLeaf('orders', 'open').valid).toBe(true);
    expect(statusLeaf('orders', 'closed').valid).toBe(false);
    // Fetched but outside the declared set: never offered, never admitted.
    expect(statusLeaf('orders', 'platinum').valid).toBe(false);
  });

  test('another path to the same model keeps the declared set — no fetch narrows it', () => {
    const leaf = statusLeaf('org.orders', 'closed');
    expect(leaf.value?.options?.map((o) => o.value)).toEqual(['open', 'closed', 'void']);
    expect(leaf.valid).toBe(true);
  });
});
