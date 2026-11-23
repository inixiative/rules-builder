import { beforeEach, describe, expect, test } from 'bun:test';
import { type Condition, type FieldMap, inferValueType } from '@inixiative/json-rules';
import { type ArrayNode, buildRoot, type LeafNode } from '../src/builder/buildNodes';
import {
  describeScopeFields,
  resolve,
  type SurfaceOptions,
  viewRoot,
  withAllRelations,
} from '../src/schema/surface';
import { parseSavedRule, type SavedRule, stringifySavedRule } from '../src/serialize';

const map: FieldMap = {
  models: {
    User: {
      fields: {
        id: { kind: 'scalar', type: 'String' },
        tier: { kind: 'scalar', type: 'String' },
        orders: { kind: 'object', type: 'Order', isList: true },
        account: { kind: 'object', type: 'Account' }, // to-one relation
      },
    },
    Order: {
      fields: {
        total: { kind: 'scalar', type: 'Float' },
        quantity: { kind: 'scalar', type: 'Int' },
        label: { kind: 'scalar', type: 'String' }, // non-numeric scalar
        metadata: { kind: 'scalar', type: 'Json' }, // check()-only aggregate target
        occurredAt: { kind: 'scalar', type: 'DateTime' },
        status: { kind: 'enum', type: 'OrderStatus' },
        userId: { kind: 'scalar', type: 'String' },
        user: { kind: 'object', type: 'User', fromFields: ['userId'], toFields: ['id'] },
      },
    },
    Account: { fields: { name: { kind: 'scalar', type: 'String' } } },
  },
  enums: { OrderStatus: ['pending', 'paid'] },
};

const lens = resolve(withAllRelations({ maps: { app: map }, mapName: 'app', model: 'User' }));
const fields = describeScopeFields(viewRoot(lens));

let committed: Condition | undefined;
const build = (c: Condition, surfaceOpts: SurfaceOptions = {}) => {
  committed = undefined;
  return buildRoot(
    c,
    lens,
    fields,
    4,
    (next) => {
      committed = next;
    },
    { surfaceOpts },
  );
};

// A `sum` over `orders.total` restricted to a date window, compared to a threshold.
const aggRule = (over: Partial<Record<string, unknown>> = {}): Condition => ({
  all: [
    {
      field: 'orders',
      aggregate: { mode: 'sum', field: 'total' },
      operator: 'greaterThan',
      value: 1000,
      condition: {
        all: [{ field: 'occurredAt', dateOperator: 'after', value: '2024-01-01', __id: 'w' }],
      },
      __id: 'agg',
      ...over,
    },
  ],
});

describe('buildRoot — aggregate nodes', () => {
  beforeEach(() => {
    committed = undefined;
  });

  test('an aggregate rule builds an array node with an aggregate facet, not a leaf', () => {
    const node = build(aggRule()).children[0];
    expect(node.kind).toBe('array');
    const a = node as ArrayNode;
    expect(a.field.value).toBe('orders');
    // element-mode operator is absent; the aggregate facet is present instead
    expect(a.arrayOperator).toBeUndefined();
    expect(a.aggregate).toBeDefined();
    expect(a.aggregate?.mode).toBe('sum');
    expect(a.aggregate?.field.value).toBe('total');
    expect(a.aggregate?.operator.value).toBe('greaterThan');
    expect(a.aggregate?.value.current).toBe(1000);
    expect(a.relation).toEqual({ mapName: 'app', modelName: 'Order' });
  });

  test('the aggregate field picker offers the related model numeric scalars + Json (tagged)', () => {
    const a = build(aggRule()).children[0] as ArrayNode;
    const opts = a.aggregate?.field.options ?? [];
    const byValue = Object.fromEntries(opts.map((o) => [o.value, o.compilesToPrisma]));
    // numeric scalars compile to Prisma; Json is offered but flagged; String/enum/DateTime excluded
    expect(Object.keys(byValue).sort()).toEqual(['metadata', 'quantity', 'total']);
    expect(byValue.total).toBe(true);
    expect(byValue.quantity).toBe(true);
    expect(byValue.metadata).toBe(false);
  });

  test('a numeric-scalar target validates and is marked compilesToPrisma', () => {
    const a = build(aggRule()).children[0] as ArrayNode;
    expect(a.valid).toBe(true);
    expect(a.aggregate?.field.valid).toBe(true);
    expect(a.aggregate?.field.compilesToPrisma).toBe(true);
  });

  test('a Json target validates (runnable via check) but is flagged check()-only', () => {
    const a = build(aggRule({ aggregate: { mode: 'sum', field: 'metadata' } }))
      .children[0] as ArrayNode;
    expect(a.valid).toBe(true); // not hard-blocked
    expect(a.aggregate?.field.valid).toBe(true);
    expect(a.aggregate?.field.compilesToPrisma).toBe(false);
  });

  test('a non-numeric scalar target (String) fails validation', () => {
    const a = build(aggRule({ aggregate: { mode: 'sum', field: 'label' } }))
      .children[0] as ArrayNode;
    expect(a.valid).toBe(false);
    expect(a.aggregate?.field.valid).toBe(false);
  });

  test('an aggregate whose field is not a list relation fails validation', () => {
    // `account` is a to-one relation, not a many/list — aggregate requires a list.
    const a = build(aggRule({ field: 'account', aggregate: { mode: 'sum', field: 'name' } }))
      .children[0] as ArrayNode;
    expect(a.valid).toBe(false);
  });

  test('notBetween is offered and valid for a toPrisma builder — every target compiles it', () => {
    const rule = aggRule({ operator: 'notBetween', value: [1, 2] });
    const a = build(rule, { targets: ['toPrisma'] }).children[0] as ArrayNode;
    expect(a.valid).toBe(true);
    expect(a.aggregate?.operator.options.map((o) => o.value)).toContain('notBetween');
  });

  test('authored windowing is valid where json-rules takes it on every target', () => {
    const windows = [
      { take: 1 },
      { skip: 2 },
      { orderBy: [{ field: 'total', dir: 'desc' }] },
      { filter: { all: [] } },
    ];
    const valid = (over: Record<string, unknown>, targets?: SurfaceOptions['targets']) =>
      (build(aggRule(over), { targets }).children[0] as ArrayNode).valid;
    // check() runs any window; toPrisma folds a filter-only window into the condition; toSql none.
    expect(windows.map((w) => valid(w))).toEqual([true, true, true, true]);
    expect(windows.map((w) => valid(w, ['toPrisma']))).toEqual([false, false, false, true]);
    expect(windows.map((w) => valid(w, ['toSql']))).toEqual([false, false, false, false]);
  });

  test('the operator picker offers every aggregate operator, whatever the targets', () => {
    const a = build(aggRule(), { targets: ['toPrisma'] }).children[0] as ArrayNode;
    expect(a.aggregate?.operator.options.map((o) => o.value)).toEqual([
      'equals',
      'notEquals',
      'lessThan',
      'lessThanEquals',
      'greaterThan',
      'greaterThanEquals',
      'between',
      'notBetween',
      'exists',
      'notExists',
    ]);
  });

  test('the element window is authored via the condition sub-builder scoped to the related model', () => {
    const a = build(aggRule()).children[0] as ArrayNode;
    expect(a.filter?.kind).toBe('group'); // check() takes a filter window on an aggregate
    expect(a.condition?.kind).toBe('group');
    const inner = a.condition?.children[0] as LeafNode;
    expect(inner.field.value).toBe('occurredAt');
    // scoped to Order's fields, not User's
    expect(inner.field.options.map((o) => o.value).sort()).toEqual([
      'label',
      'metadata',
      'occurredAt',
      'quantity',
      'status',
      'total',
      'userId',
    ]);
  });

  test('setMode commits a new aggregate mode', () => {
    const a = build(aggRule()).children[0] as ArrayNode;
    a.aggregate?.setMode('avg');
    const child = (committed as { all: Condition[] }).all[0] as Record<string, unknown>;
    expect((child.aggregate as { mode: string }).mode).toBe('avg');
    expect((child.aggregate as { field: string }).field).toBe('total'); // target preserved
  });

  test('aggregate.field.set commits the new numeric target', () => {
    const a = build(aggRule()).children[0] as ArrayNode;
    a.aggregate?.field.set('quantity');
    const child = (committed as { all: Condition[] }).all[0] as Record<string, unknown>;
    expect((child.aggregate as { field: string }).field).toBe('quantity');
    expect((child.aggregate as { mode: string }).mode).toBe('sum');
  });

  test('operator.set + value.set commit a between threshold', () => {
    const a = build(aggRule()).children[0] as ArrayNode;
    a.aggregate?.operator.set('between');
    const afterOp = (committed as { all: Condition[] }).all[0] as Record<string, unknown>;
    expect(afterOp.operator).toBe('between');
    // rebuild off the committed state so the value control sees the new operator shape
    const a2 = build(committed as Condition).children[0] as ArrayNode;
    expect(a2.aggregate?.value.shape).toBe('range');
    a2.aggregate?.value.set([100, 500]);
    const afterVal = (committed as { all: Condition[] }).all[0] as Record<string, unknown>;
    expect(afterVal.value).toEqual([100, 500]);
  });

  test('switching to exists drops the threshold and takes no value', () => {
    const a = build(aggRule({ aggregate: { mode: 'avg', field: 'total' } }))
      .children[0] as ArrayNode;
    a.aggregate?.operator.set('exists');
    const afterOp = (committed as { all: Condition[] }).all[0] as Record<string, unknown>;
    expect(afterOp.operator).toBe('exists');
    expect('value' in afterOp).toBe(false);
    const a2 = build(committed as Condition).children[0] as ArrayNode;
    expect(a2.aggregate?.value.shape).toBe('none');
    expect(a2.valid).toBe(true);
  });

  test('editing the element window commits back under the aggregate rule condition', () => {
    const a = build(aggRule({ condition: { all: [] } })).children[0] as ArrayNode;
    a.condition?.addRule();
    const child = (committed as { all: Condition[] }).all[0] as Record<string, unknown>;
    expect((child.aggregate as { mode: string }).mode).toBe('sum');
    expect((child.condition as { all: unknown[] }).all).toHaveLength(1);
  });

  test('re-pointing the relation preserves aggregate mode + operator/value, clears the target', () => {
    const a = build(aggRule()).children[0] as ArrayNode;
    a.field.set('orders'); // same relation, exercises the aggregate-preserving branch
    const child = (committed as { all: Condition[] }).all[0] as Record<string, unknown>;
    expect(child.field).toBe('orders');
    expect((child.aggregate as { mode: string }).mode).toBe('sum');
    expect((child.aggregate as { field?: string }).field).toBeUndefined(); // reset
    expect(child.operator).toBe('greaterThan');
    expect(child.value).toBe(1000);
    expect(child.__id).toBe('agg'); // identity preserved
  });

  test('round-trips through stringify/parse without shape drift', () => {
    const saved: SavedRule = {
      source: { maps: { app: map }, mapName: 'app', model: 'User' },
      rule: aggRule(),
    };
    const round = parseSavedRule(stringifySavedRule(saved));
    expect(round.rule).toEqual(saved.rule);
    // and the parsed rule still builds an aggregate node
    const a = build(round.rule).children[0] as ArrayNode;
    expect(a.aggregate?.mode).toBe('sum');
    expect(a.aggregate?.field.value).toBe('total');
  });
});

describe('buildRoot — a pick: the values the window of an aggregate rule picks', () => {
  const agg = (c: Condition, surfaceOpts: SurfaceOptions = {}) =>
    (build(c, surfaceOpts).children[0] as ArrayNode).aggregate as NonNullable<
      ArrayNode['aggregate']
    >;
  const node = (c: Condition, surfaceOpts: SurfaceOptions = {}) =>
    build(c, surfaceOpts).children[0] as ArrayNode;
  // The label of the largest order.
  const pickRule = (over: Record<string, unknown> = {}): Condition =>
    aggRule({
      aggregate: { mode: 'pick', field: 'label' },
      orderBy: [{ field: 'total', dir: 'desc' }],
      take: 1,
      operator: 'equals',
      value: 'gold',
      condition: undefined,
      ...over,
    });
  const values = (options: { value: string }[] | undefined) => options?.map((o) => o.value);

  test('is offered where every target runs it, and stays listed where it is authored', () => {
    expect(values(agg(aggRule()).modeOptions)).toEqual(['sum', 'avg', 'pick']);
    expect(values(agg(aggRule(), { targets: ['toPrisma'] as never }).modeOptions)).toEqual([
      'sum',
      'avg',
    ]);
    expect(values(agg(pickRule(), { targets: ['toPrisma'] as never }).modeOptions)).toContain(
      'pick',
    );
    expect(node(pickRule(), { targets: ['toPrisma'] as never }).valid).toBe(false);
  });

  test('reads a column of any kind, never a relation', () => {
    expect(values(agg(pickRule()).field.options)?.sort()).toEqual(
      ['label', 'metadata', 'occurredAt', 'quantity', 'status', 'total', 'userId'].sort(),
    );
    expect(agg(pickRule()).field.valid).toBe(true);
    expect(node(pickRule()).valid).toBe(true);
    // `sum` still reads numbers and Json only.
    expect(values(agg(aggRule()).field.options)?.sort()).toEqual(['metadata', 'quantity', 'total']);
  });

  test('one value (take 1) compares as its column does; several take membership only', () => {
    const one = agg(pickRule());
    expect(values(one.operator.options)).toEqual(
      expect.arrayContaining(['equals', 'in', 'contains', 'greaterThan']),
    );
    expect(one.value.kind).toBe('String');
    expect(values(agg(pickRule({ take: 3, operator: 'contains' })).operator.options)).toEqual([
      'contains',
      'notContains',
    ]);
    expect(
      values(agg(pickRule({ take: undefined, operator: 'contains' })).operator.options),
    ).toEqual(['contains', 'notContains']);
    expect(node(pickRule({ take: 3, operator: 'contains' })).valid).toBe(true);
  });

  test("the value is picked from the column's enum", () => {
    const status = agg(pickRule({ aggregate: { mode: 'pick', field: 'status' }, value: 'paid' }));
    expect(status.value.kind).toBe('Enum');
    expect(values(status.value.options)).toEqual(['pending', 'paid']);
    expect(
      node(pickRule({ aggregate: { mode: 'pick', field: 'status' }, value: 'refunded' })).valid,
    ).toBe(false);
    // `sum` compares a number, whatever the column.
    expect(agg(aggRule()).value.kind).toBe('Float');
    expect(agg(aggRule()).value.options).toBeUndefined();
  });

  test('sum → pick keeps the window and a comparison the pick still takes', () => {
    agg(aggRule({ orderBy: [{ field: 'total', dir: 'desc' }], take: 1 })).setMode('pick');
    expect((committed as { all: unknown[] }).all[0]).toMatchObject({
      aggregate: { mode: 'pick', field: 'total' },
      orderBy: [{ field: 'total', dir: 'desc' }],
      take: 1,
      operator: 'greaterThan',
      value: 1000,
    });
  });

  test('pick → sum drops a column sum cannot read, and a value compared as another kind', () => {
    agg(pickRule()).setMode('sum');
    const next = (committed as { all: Record<string, unknown>[] }).all[0];
    expect(next.aggregate).toEqual({ mode: 'sum' });
    expect(next.operator).toBe('equals');
    expect(next).not.toHaveProperty('value');
    expect(next.take).toBe(1);
  });

  test('a new column of another kind drops the value, of the same kind keeps it', () => {
    agg(pickRule()).field.set('status');
    const moved = (committed as { all: Record<string, unknown>[] }).all[0];
    expect(moved.aggregate).toEqual({ mode: 'pick', field: 'status' });
    expect(moved.operator).toBe('equals');
    expect(moved).not.toHaveProperty('value');

    agg(pickRule()).field.set('userId');
    expect((committed as { all: unknown[] }).all[0]).toMatchObject({
      aggregate: { mode: 'pick', field: 'userId' },
      value: 'gold',
    });
  });

  test('take decides one value or a list, and the comparison does not cross between them', () => {
    node(pickRule()).window?.setTake(3);
    const listed = (committed as { all: Record<string, unknown>[] }).all[0];
    expect(listed.take).toBe(3);
    expect(listed).not.toHaveProperty('operator');
    expect(listed).not.toHaveProperty('value');

    // `contains` is a substring of one value and a member of a list: it is not carried over.
    node(pickRule({ take: 3, operator: 'contains' })).window?.setTake(1);
    const one = (committed as { all: Record<string, unknown>[] }).all[0];
    expect(one.take).toBe(1);
    expect(one).not.toHaveProperty('operator');
    expect(one).not.toHaveProperty('value');

    // A change that keeps it a list keeps the comparison.
    node(pickRule({ take: 3, operator: 'contains' })).window?.setTake(5);
    expect((committed as { all: unknown[] }).all[0]).toMatchObject({
      take: 5,
      operator: 'contains',
      value: 'gold',
    });
  });

  test('a list pick compares one member: a scalar of the column kind', () => {
    const several = agg(
      pickRule({
        aggregate: { mode: 'pick', field: 'quantity' },
        take: 3,
        operator: 'contains',
        value: 2,
      }),
    );
    expect(several.value.shape).toBe('scalar');
    expect(several.value.kind).toBe('Int');
    expect(agg(pickRule({ take: 3, operator: undefined, value: undefined })).value.shape).toBe(
      'none',
    );
  });

  test('a path or a binding compared with goes as a value does', () => {
    const withPath = pickRule({ value: undefined, path: 'tier' });
    node(withPath).window?.setTake(3);
    const listed = (committed as { all: Record<string, unknown>[] }).all[0];
    expect(listed).not.toHaveProperty('operator');
    expect(listed).not.toHaveProperty('path');

    agg(withPath).setMode('sum');
    const summed = (committed as { all: Record<string, unknown>[] }).all[0];
    expect(summed.operator).toBe('equals');
    expect(summed).not.toHaveProperty('path');

    agg(pickRule({ value: undefined, bind: 'b' })).field.set('quantity');
    expect((committed as { all: Record<string, unknown>[] }).all[0]).not.toHaveProperty('bind');

    agg(withPath).field.set('userId');
    expect((committed as { all: unknown[] }).all[0]).toMatchObject({ path: 'tier' });
  });

  test('a number stays across sum and pick over numeric columns', () => {
    agg(aggRule({ aggregate: { mode: 'sum', field: 'quantity' }, value: 5, take: 1 })).setMode(
      'pick',
    );
    expect((committed as { all: unknown[] }).all[0]).toMatchObject({
      aggregate: { mode: 'pick', field: 'quantity' },
      operator: 'greaterThan',
      value: 5,
    });
    agg(
      pickRule({
        aggregate: { mode: 'pick', field: 'quantity' },
        operator: 'greaterThan',
        value: 5,
      }),
    ).setMode('sum');
    expect((committed as { all: unknown[] }).all[0]).toMatchObject({
      aggregate: { mode: 'sum', field: 'quantity' },
      value: 5,
    });
  });

  test('coerceType is the kind compared, and goes when the mode or column changes', () => {
    const coerced = pickRule({ coerceType: 'Int', value: 3 });
    expect(agg(coerced).value.kind).toBe('Int');
    expect(
      agg(pickRule({ aggregate: { mode: 'pick', field: 'status' }, coerceType: 'String' })).value
        .options,
    ).toBeUndefined();

    agg(pickRule({ aggregate: { mode: 'pick', field: 'quantity' }, coerceType: 'String' })).setMode(
      'sum',
    );
    expect((committed as { all: Record<string, unknown>[] }).all[0]).not.toHaveProperty(
      'coerceType',
    );
    agg(coerced).field.set('userId');
    expect((committed as { all: Record<string, unknown>[] }).all[0]).not.toHaveProperty(
      'coerceType',
    );
    node(coerced).window?.setTake(1);
    expect((committed as { all: unknown[] }).all[0]).toMatchObject({ coerceType: 'Int', value: 3 });
  });

  test('re-pointing the list drops the window, so a pick of one becomes a list', () => {
    node(pickRule()).field.set('orders');
    const next = (committed as { all: Record<string, unknown>[] }).all[0];
    expect(next.aggregate).toEqual({ mode: 'pick' });
    expect(next).not.toHaveProperty('take');
    expect(next).not.toHaveProperty('operator');
    expect(next).not.toHaveProperty('value');
  });

  test('an operator the catalog does not know is left alone', () => {
    agg(pickRule({ operator: 'legacyOp' })).field.set('userId');
    expect((committed as { all: unknown[] }).all[0]).toMatchObject({ operator: 'legacyOp' });
  });

  test('the kind compared is the type json-rules gives the aggregate', () => {
    const columns = ['total', 'quantity', 'label', 'occurredAt', 'status'];
    const shapes: Record<string, unknown>[] = [
      ...columns.map((field) => ({ aggregate: { mode: 'pick', field }, take: 1 })),
      ...columns.map((field) => ({ aggregate: { mode: 'pick', field }, take: 3 })),
      { aggregate: { mode: 'sum', field: 'total' } },
      { aggregate: { mode: 'sum', field: 'quantity' } },
      { aggregate: { mode: 'avg', field: 'total' } },
      { aggregate: { mode: 'avg', field: 'quantity' } },
      { aggregate: { mode: 'pick', field: 'label' }, take: 1, coerceType: 'Int' },
    ];
    for (const shape of shapes) {
      const expression = { field: 'orders', ...shape } as never;
      const built = agg({ all: [{ ...shape, field: 'orders', operator: 'exists' }] } as never);
      expect([shape, built.value.kind]).toEqual([
        shape,
        inferValueType(expression, lens.lens).kind,
      ]);
    }
  });

  test('a scalar list is read without a column', () => {
    const tagged = resolve(
      withAllRelations({
        maps: {
          app: {
            models: {
              Post: {
                fields: {
                  tags: { kind: 'scalar', type: 'String', isList: true },
                  scores: { kind: 'scalar', type: 'Int', isList: true },
                },
              },
            },
          },
        },
        mapName: 'app',
        model: 'Post',
      }),
    );
    const over = (rule: Record<string, unknown>) =>
      buildRoot(
        { all: [rule] } as never,
        tagged,
        describeScopeFields(viewRoot(tagged)),
        4,
        () => {},
      ).children[0] as ArrayNode;
    const picked = over({
      field: 'tags',
      aggregate: { mode: 'pick' },
      take: 1,
      operator: 'equals',
      value: 'a',
    });
    expect(picked.valid).toBe(true);
    expect(picked.aggregate?.field.valid).toBe(true);
    expect(picked.aggregate?.value.kind).toBe('String');
    expect(
      over({ field: 'scores', aggregate: { mode: 'sum' }, operator: 'greaterThan', value: 3 })
        .valid,
    ).toBe(true);
    expect(
      over({ field: 'tags', aggregate: { mode: 'sum' }, operator: 'greaterThan', value: 3 })
        .aggregate?.field.valid,
    ).toBe(false);
  });

  test('a pick round-trips through stringify/parse', () => {
    const saved: SavedRule = {
      source: { maps: { app: map }, mapName: 'app', model: 'User' },
      rule: pickRule(),
    };
    const round = parseSavedRule(stringifySavedRule(saved));
    expect(round.rule).toEqual(saved.rule);
    expect(agg(round.rule).mode).toBe('pick');
  });
});
