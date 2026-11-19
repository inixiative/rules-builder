import { beforeEach, describe, expect, test } from 'bun:test';
import type { FieldMap } from '@inixiative/field-map';
import { AGGREGATE_MODES, type Condition, Operator } from '@inixiative/json-rules';
import { type ArrayNode, buildRoot, type IfNode, type LeafNode } from '../src/builder/buildNodes';
import { describeScopeFields, resolve, viewRoot, withAllRelations } from '../src/schema/surface';

const map: FieldMap = {
  models: {
    Account: {
      fields: {
        tier: { kind: 'scalar', type: 'String' },
        seats: { kind: 'scalar', type: 'Int' },
        deals: { kind: 'object', type: 'Deal', isList: true },
      },
    },
    Deal: {
      fields: {
        amount: { kind: 'scalar', type: 'Float' },
        stage: { kind: 'scalar', type: 'String' },
        closedAt: { kind: 'scalar', type: 'DateTime' },
      },
    },
  },
};

const view = resolve(withAllRelations({ maps: { app: map }, mapName: 'app', model: 'Account' }));

let committed: Condition | undefined;
const build = (c: Condition, positive = false) => {
  committed = undefined;
  const surfaceOpts = { positive };
  return buildRoot(
    c,
    view,
    describeScopeFields(viewRoot(view), surfaceOpts),
    4,
    (next) => {
      committed = next;
    },
    { surfaceOpts },
  );
};

beforeEach(() => {
  committed = undefined;
});

const aggregate: Condition = {
  field: 'deals',
  aggregate: { mode: 'sum', field: 'amount' },
  operator: Operator.greaterThan,
  value: 1000,
};

describe('aggregate modes come from json-rules', () => {
  test('the mode picker offers exactly json-rules AGGREGATE_MODES', () => {
    const node = build(aggregate) as ArrayNode;
    expect(node.aggregate?.modeOptions.map((o) => o.value)).toEqual([...AGGREGATE_MODES]);
    expect(node.aggregate?.mode).toBe('sum');
  });
});

describe('the aggregate window: orderBy, skip, take beside filter', () => {
  test('ordering by a related column, then keeping the first three', () => {
    const node = build(aggregate) as ArrayNode;
    expect(node.window?.orderByOptions.map((o) => o.value).sort()).toEqual([
      'amount',
      'closedAt',
      'stage',
    ]);
    node.window?.setOrderBy([{ field: 'closedAt', dir: 'desc' }]);
    expect(committed).toMatchObject({ orderBy: [{ field: 'closedAt', dir: 'desc' }] });
    const again = build(committed as Condition) as ArrayNode;
    again.window?.setTake(3);
    expect(committed).toMatchObject({ orderBy: [{ field: 'closedAt', dir: 'desc' }], take: 3 });
  });

  test('clearing a window key drops it from the rule', () => {
    const node = build({ ...aggregate, take: 2, skip: 1 } as Condition) as ArrayNode;
    expect(node.window?.take).toBe(2);
    node.window?.setSkip(undefined);
    expect(committed).not.toHaveProperty('skip');
    expect(committed).toMatchObject({ take: 2 });
  });
});

describe('an if node', () => {
  const implication: Condition = {
    if: { field: 'tier', operator: Operator.equals, value: 'gold' },
    then: { field: 'seats', operator: Operator.greaterThan, value: 10 },
  };

  test('builds its if and then as ordinary nodes, and edits commit at their slot', () => {
    const node = build(implication) as IfNode;
    expect(node.kind).toBe('if');
    expect(node.if.kind).toBe('leaf');
    expect(node.then.kind).toBe('leaf');
    expect(node.else).toBeUndefined();
    expect(node.valid).toBe(true);
    (node.then as LeafNode).value.set(20);
    expect(committed).toMatchObject({ then: { field: 'seats', value: 20 } });
  });

  test('an else can be added and removed', () => {
    const node = build(implication) as IfNode;
    node.addElse?.();
    expect(committed).toMatchObject({ else: { all: [] } });
    const withElse = build(committed as Condition) as IfNode;
    expect(withElse.else?.kind).toBe('group');
    withElse.removeElse?.();
    expect(committed).not.toHaveProperty('else');
  });

  test('nested in a group, it is a child like any other', () => {
    const root = build({ all: [implication] });
    expect(root.kind === 'group' && root.children[0].kind).toBe('if');
  });
});

describe('the positive gate', () => {
  test('offers no operator that can hold on a missing value, and no array operator', () => {
    const root = build(
      { all: [{ field: 'tier', operator: Operator.equals, value: 'gold' }] },
      true,
    );
    const leaf = root.kind === 'group' ? (root.children[0] as LeafNode) : undefined;
    const ops = leaf?.operator.options.map((o) => o.value) ?? [];
    expect(ops).toContain(Operator.equals);
    expect(ops).not.toContain(Operator.notEquals);
    expect(ops).not.toContain(Operator.isEmpty);
    const deals = describeScopeFields(viewRoot(view), { positive: true }).find(
      (f) => f.name === 'deals',
    );
    expect(deals?.operators.array).toEqual([]);
  });

  test('marks a negated rule, an array rule or an implication invalid', () => {
    const negated = build(
      { field: 'tier', operator: Operator.notEquals, value: 'x' },
      true,
    ) as LeafNode;
    expect(negated.valid).toBe(false);
    const list = build(
      { field: 'deals', arrayOperator: 'any', condition: { all: [] } } as Condition,
      true,
    ) as ArrayNode;
    expect(list.valid).toBe(false);
    const implication = build(
      { if: { field: 'tier', operator: Operator.equals, value: 'a' }, then: true },
      true,
    ) as IfNode;
    expect(implication.valid).toBe(false);
    expect(
      (build({ field: 'tier', operator: Operator.equals, value: 'x' }, true) as LeafNode).valid,
    ).toBe(true);
  });
});
