import { afterEach, describe, expect, test } from 'bun:test';
import type { Condition, FieldMap, RuleTarget } from '@inixiative/json-rules';
import { cleanup, renderHook } from '@testing-library/react';
import {
  type ArrayNode,
  buildRoot,
  type GroupNode,
  type LeafNode,
} from '../src/builder/buildNodes';
import { useRuleBuilder } from '../src/builder/useRuleBuilder';
import type { ActionLeafNode } from '../src/permissions/buildActionRoot';
import { useActionRuleBuilder } from '../src/permissions/useActionRuleBuilder';
import {
  describeScopeFields,
  type RuleBuilderSource,
  resolve,
  viewRoot,
  withAllRelations,
} from '../src/schema/surface';

afterEach(cleanup);

const map: FieldMap = {
  models: {
    User: {
      fields: {
        name: { kind: 'scalar', type: 'String' },
        nick: { kind: 'scalar', type: 'String' },
        age: { kind: 'scalar', type: 'Int' },
        creditLimit: { kind: 'scalar', type: 'Float' },
        role: { kind: 'enum', type: 'Role' },
        orders: { kind: 'object', type: 'Order', isList: true },
        account: { kind: 'object', type: 'Account' },
      },
    },
    Order: {
      fields: {
        id: { kind: 'scalar', type: 'Int' },
        userId: { kind: 'scalar', type: 'Int' },
        total: { kind: 'scalar', type: 'Float' },
        cap: { kind: 'scalar', type: 'Float' },
        label: { kind: 'scalar', type: 'String' },
        user: {
          kind: 'object',
          type: 'User',
          fromFields: ['userId'],
          toFields: ['id'],
        },
      },
    },
    Account: {
      fields: {
        name: { kind: 'scalar', type: 'String' },
        parent: { kind: 'object', type: 'Account' },
      },
    },
  },
  enums: { Role: ['admin', 'member'] },
};

const source: RuleBuilderSource = withAllRelations({
  maps: { app: map },
  mapName: 'app',
  model: 'User',
});
const view = resolve(source);
const fields = describeScopeFields(viewRoot(view));

const build = (c: Condition, targets?: RuleTarget[]): GroupNode =>
  buildRoot({ all: [c] }, view, fields, 4, () => {}, { surfaceOpts: { targets } }) as GroupNode;

const inOrders = (leaf: Condition): Condition => ({
  field: 'orders',
  arrayOperator: 'any',
  condition: { all: [leaf] },
});
const orderLeaf = (g: GroupNode): LeafNode =>
  (g.children[0] as ArrayNode).condition?.children[0] as LeafNode;

describe('useRuleBuilder().validate — the schema rides along (A1)', () => {
  test('a same-type column compare validates for toPrisma, as describe() says', () => {
    const { result } = renderHook(() =>
      useRuleBuilder({
        source,
        defaultValue: { field: 'name', operator: 'equals', path: 'nick' },
      }),
    );
    expect(result.current.validate('toPrisma')).toEqual({ ok: true, errors: [] });
    expect(result.current.describe().supportedTargets).toContain('toPrisma');
  });
});

describe('column refs are gated by the builder targets (A2)', () => {
  test('a leaf comparing two columns of different types is invalid for toPrisma', () => {
    const leaf = build({ field: 'name', operator: 'equals', path: 'age' }, ['toPrisma'])
      .children[0] as LeafNode;
    expect(leaf.valid).toBe(false);
  });

  test('a leaf reading an enclosing scope is invalid for toPrisma, valid for check', () => {
    const rule = inOrders({ field: 'total', operator: 'lessThan', path: '$$.age' });
    expect(orderLeaf(build(rule, ['toPrisma'])).valid).toBe(false);
    expect(orderLeaf(build(rule)).valid).toBe(true);
  });

  test('the path picker offers only same-type refs', () => {
    const leaf = build({ field: 'name', operator: 'equals', path: '' }).children[0] as LeafNode;
    const scopes = leaf.value?.path?.scopes ?? [];
    expect(scopes.map((s) => s.prefix)).toEqual(['$.']);
    expect(scopes[0].options.map((o) => o.value).sort()).toEqual(['$.name', '$.nick']);
  });

  test('an enum ref is offered only against an enum of its own type', () => {
    const leaf = build({ field: 'role', operator: 'equals', path: '' }).children[0] as LeafNode;
    expect(leaf.value?.path?.scopes[0].options.map((o) => o.value)).toEqual(['$.role']);
  });

  test('under toPrisma the picker drops enclosing scopes; under check it offers them', () => {
    const rule = inOrders({ field: 'total', operator: 'lessThan', path: '' });
    const prisma = orderLeaf(build(rule, ['toPrisma'])).value?.path?.scopes ?? [];
    expect(prisma.map((s) => s.prefix)).toEqual(['$.']);
    expect(prisma[0].options.map((o) => o.value).sort()).toEqual(['$.cap', '$.total']);
    const check = orderLeaf(build(rule)).value?.path?.scopes ?? [];
    expect(check.map((s) => s.prefix)).toEqual(['$.', '$$.']);
    expect(check[1].options.map((o) => o.value)).toEqual(['$$.creditLimit']);
  });
});

describe('aggregates defer to json-rules (A3)', () => {
  const agg = (over: Record<string, unknown> = {}): Condition =>
    ({
      field: 'orders',
      aggregate: { mode: 'sum', field: 'total' },
      operator: 'greaterThan',
      value: 100,
      ...over,
    }) as Condition;
  const filter = { all: [{ field: 'label', operator: 'equals', value: 'x' }] };

  test('a filter on an aggregate is valid where json-rules accepts it', () => {
    const plain = build(agg({ filter })).children[0] as ArrayNode;
    expect(plain.valid).toBe(true);
    expect(plain.filter?.children).toHaveLength(1);
    const prisma = build(agg({ filter }), ['toPrisma']).children[0] as ArrayNode;
    expect(prisma.valid).toBe(true);
  });

  test('toSql refuses a window: invalid, and no filter offered on a fresh aggregate', () => {
    expect((build(agg({ filter }), ['toSql']).children[0] as ArrayNode).valid).toBe(false);
    expect((build(agg(), ['toSql']).children[0] as ArrayNode).filter).toBeUndefined();
    expect((build(agg(), ['toPrisma']).children[0] as ArrayNode).filter).toBeDefined();
  });

  test('an ordered window on an aggregate is refused by toPrisma, accepted by check', () => {
    const take = agg({ orderBy: [{ field: 'total', dir: 'desc' }], take: 1 });
    expect((build(take, ['toPrisma']).children[0] as ArrayNode).valid).toBe(false);
    expect((build(take).children[0] as ArrayNode).valid).toBe(true);
  });
});

describe('useActionRuleBuilder rel walk is gated by the lens at every hop (A5)', () => {
  const narrowed: RuleBuilderSource = {
    maps: { app: map },
    mapName: 'app',
    model: 'User',
    narrowing: { root: { relations: { account: {} } } },
  };

  test('a hop the lens does not turn on is not offered', () => {
    const { result } = renderHook(() =>
      useActionRuleBuilder({ source: narrowed, defaultValue: { rel: 'account', action: '' } }),
    );
    const root = result.current.root as ActionLeafNode;
    expect(root.rel?.segments[0].options.map((o) => o.value)).toEqual(['account']);
    expect(root.rel?.target).toBe('app:Account');
    expect(root.rel?.addOptions).toEqual([]);
  });

  test('a walk through a hop the lens hides does not resolve', () => {
    const { result } = renderHook(() =>
      useActionRuleBuilder({
        source: narrowed,
        defaultValue: { rel: 'account.parent', action: '' },
      }),
    );
    const root = result.current.root as ActionLeafNode;
    expect(root.rel?.target).toBeUndefined();
  });

  test('a hop the lens turns on deeper is offered there', () => {
    const deeper: RuleBuilderSource = {
      ...narrowed,
      narrowing: { root: { relations: { account: { relations: { parent: {} } } } } },
    };
    const { result } = renderHook(() =>
      useActionRuleBuilder({ source: deeper, defaultValue: { rel: 'account.parent', action: '' } }),
    );
    const root = result.current.root as ActionLeafNode;
    expect(root.rel?.segments[1].options.map((o) => o.value)).toEqual(['parent']);
    expect(root.rel?.target).toBe('app:Account');
  });
});
