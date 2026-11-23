import { beforeEach, describe, expect, test } from 'bun:test';
import type { FieldMap } from '@inixiative/field-map';
import { type Categorization, Operator, type ValueExpression } from '@inixiative/json-rules';
import { describeScopeFields, resolve, viewRoot, withAllRelations } from '../src/schema/surface';
import {
  type AggregateValueNode,
  buildCategorizationRoot,
  buildValueExpressionRoot,
  cleanCategorization,
  cleanValue,
  type IfValueNode,
  type ListValueNode,
  type LiteralValueNode,
  type SourceValueNode,
} from '../src/values';

const map: FieldMap = {
  models: {
    Account: {
      fields: {
        tier: { kind: 'scalar', type: 'String' },
        seats: { kind: 'scalar', type: 'Int' },
        renewedAt: { kind: 'scalar', type: 'DateTime' },
        owner: { kind: 'object', type: 'User' },
        deals: { kind: 'object', type: 'Deal', isList: true },
      },
    },
    User: { fields: { email: { kind: 'scalar', type: 'String' } } },
    Deal: {
      fields: {
        amount: { kind: 'scalar', type: 'Float' },
        stage: { kind: 'scalar', type: 'String' },
      },
    },
  },
};

const view = resolve(withAllRelations({ maps: { app: map }, mapName: 'app', model: 'Account' }));
const fields = describeScopeFields(viewRoot(view));

let committed: ValueExpression | undefined;
const value = (expr: ValueExpression, extra: Record<string, unknown> = {}) =>
  buildValueExpressionRoot(expr, {
    view,
    fields,
    commit: (next) => {
      committed = next;
    },
    ...extra,
  });

beforeEach(() => {
  committed = undefined;
});

describe('a literal', () => {
  test('is set as written', () => {
    const node = value('gold') as LiteralValueNode;
    expect(node.kind).toBe('literal');
    node.set('silver');
    expect(committed).toBe('silver');
  });

  test("names its kind when the caller's target reads a date or number (FEAT-008)", () => {
    const node = value('', { expectedKind: 'DateTime' }) as LiteralValueNode;
    expect(node.coerceType).toBe('DateTime');
    node.set('2027-01-01');
    expect(committed).toEqual({ value: '2027-01-01', coerceType: 'DateTime' });
    const coerced = value({
      value: '2027-01-01',
      coerceType: 'DateTime',
    } as ValueExpression) as LiteralValueNode;
    expect(coerced.kind).toBe('literal');
    expect(coerced.value).toBe('2027-01-01');
    expect(coerced.type?.kind).toBe('DateTime');
  });

  test('an object keeps the { value } wrapper json-rules requires', () => {
    (value('') as LiteralValueNode).set({ a: 1 });
    expect(committed).toEqual({ value: { a: 1 } });
  });
});

describe('a source', () => {
  test('offers the row values through to-one relations, never past a list', () => {
    const node = value({ path: '' } as ValueExpression) as SourceValueNode;
    const paths = node.sourcePath?.options.map((o) => o.value) ?? [];
    expect(paths).toContain('owner.email');
    expect(paths).not.toContain('deals.amount');
    node.sourcePath?.set('owner.email');
    expect(committed).toEqual({ path: 'owner.email' });
    expect(value({ path: 'seats' } as ValueExpression).type?.kind).toBe('Int');
  });

  test("a path the lens doesn't show is an issue on the node that reads it", () => {
    const node = value({
      if: { all: [] },
      then: { path: 'owner.nope' },
    } as ValueExpression) as IfValueNode;
    expect(node.then.issues.map((i) => i.code)).toContain('not_in_lens');
    expect(node.issues.map((i) => i.code)).not.toContain('not_in_lens');
  });

  test('offers bindings only where the caller allows them', () => {
    expect(
      (value({ path: '' } as ValueExpression) as SourceValueNode).mode.options.map((o) => o.value),
    ).toEqual(['path', 'bind']);
    const noBinds = value({ path: '' } as ValueExpression, { bindings: false }) as SourceValueNode;
    expect(noBinds.mode.options.map((o) => o.value)).toEqual(['path']);
  });
});

describe('an aggregate', () => {
  const sum = { field: 'deals', aggregate: { mode: 'sum', field: 'amount' } } as ValueExpression;

  test('offers the modes that read the element column', () => {
    const node = value(sum) as AggregateValueNode;
    expect(node.mode.options.map((o) => o.value)).toEqual([
      'sum',
      'avg',
      'count',
      'min',
      'max',
      'distinct',
      'pick',
    ]);
    expect(node.field?.options.map((o) => o.value).sort()).toEqual(['amount', 'stage']);
    expect(node.type?.kind).toBe('Float');
    expect(node.list.condition).toBeDefined();
  });

  test("a pick is the window's values: one for take 1, else a list, of any kind", () => {
    const one = value({
      field: 'deals',
      aggregate: { mode: 'pick', field: 'stage' },
      orderBy: [{ field: 'amount', dir: 'desc' }],
      take: 1,
    } as ValueExpression) as AggregateValueNode;
    expect(one.issues).toEqual([]);
    expect(one.mode.options.map((o) => o.value)).toContain('pick');
    expect(one.type).toMatchObject({ kind: 'String', isList: false, nullable: true });

    const top = value({
      field: 'deals',
      aggregate: { mode: 'pick', field: 'stage' },
      orderBy: [{ field: 'amount', dir: 'desc' }],
      take: 3,
    } as ValueExpression) as AggregateValueNode;
    expect(top.issues).toEqual([]);
    expect(top.type).toMatchObject({ kind: 'String', isList: true });
  });

  test('a column that the mode cannot read resets it to count', () => {
    (value(sum) as AggregateValueNode).field?.set('stage');
    expect(committed).toEqual({ field: 'deals', aggregate: { mode: 'count', field: 'stage' } });
  });

  test('editing its element condition writes the aggregate without a comparison', () => {
    const node = value(sum) as AggregateValueNode;
    node.list.condition?.addRule();
    expect(committed).toMatchObject({
      field: 'deals',
      aggregate: { mode: 'sum', field: 'amount' },
    });
    expect(committed).not.toHaveProperty('operator');
    expect(committed).not.toHaveProperty('value');
  });
});

describe('if / then / else and lists', () => {
  test("an if's condition is the condition builder; else can be added", () => {
    const node = value({ if: { all: [] }, then: 1 } as ValueExpression) as IfValueNode;
    expect(node.if.kind).toBe('group');
    expect(node.then.kind).toBe('literal');
    node.addElse?.();
    expect(committed).toEqual({ if: { all: [] }, then: 1, else: '' });
  });

  test('a type that disagrees across branches is reported at the branch', () => {
    const node = value({ if: { all: [] }, then: 1, else: 'x' } as ValueExpression) as IfValueNode;
    expect(node.type).toBeNull();
    expect([...node.issues, ...(node.else?.issues ?? [])].map((i) => i.code)).toContain(
      'value_type_mismatch',
    );
  });

  test('a list adds, removes and dedupes items', () => {
    const node = value([1, 2] as ValueExpression) as ListValueNode;
    node.addItem();
    expect(committed).toEqual([1, 2, '']);
    node.items[0].remove?.();
    expect(committed).toEqual([2]);
    node.distinct.set(true);
    expect(committed).toEqual({ list: [1, 2], distinct: true });
  });

  test('the shape picker swaps a value for a blank of the shape', () => {
    value('x').shape.set('aggregate');
    expect(committed).toEqual({ field: '', aggregate: { mode: 'count' } });
  });

  test("the root reports the caller's acceptsType of its type", () => {
    const node = value({ path: 'seats' } as ValueExpression, {
      acceptsType: (t: { kind: string | null }) => t.kind === 'Int',
    });
    expect(node.accepted).toBe(true);
  });
});

describe('cleanValue', () => {
  test("stamps an if's condition from the lens, as the rule builder stamps a rule", () => {
    const cleaned = cleanValue(
      {
        if: { field: 'seats', operator: Operator.greaterThan, value: '10', __id: 'x' },
        then: 'big',
      } as ValueExpression,
      view.lens,
    );
    expect(cleaned).toEqual({
      if: { field: 'seats', operator: Operator.greaterThan, value: '10', coerceType: 'Int' },
      then: 'big',
    });
  });
});

describe('a categorization', () => {
  let cat: Categorization | undefined;
  const categorize = (c: Categorization, extra: Record<string, unknown> = {}) =>
    buildCategorizationRoot(c, {
      view,
      fields,
      commit: (next) => {
        cat = next;
      },
      ...extra,
    });
  const big = { field: 'seats', operator: Operator.greaterThan, value: 100 };
  const tiers: Categorization = {
    cases: [
      { if: big, then: 'enterprise' },
      { if: { field: 'seats', operator: Operator.lessThan, value: 10 }, then: { path: 'tier' } },
    ],
    default: 'standard',
  };

  test('builds each case as a condition and a value, and types the result', () => {
    const root = categorize(tiers);
    expect(root.cases).toHaveLength(2);
    expect(root.cases[0].if.kind).toBe('leaf');
    expect(root.cases[1].then.kind).toBe('source');
    // `tier` may be null (not required), so the result may be.
    expect(root.type).toEqual({ kind: 'String', isList: false, nullable: true });
    expect(root.default?.kind).toBe('literal');
  });

  test('adds, reorders and removes cases', () => {
    categorize(tiers).addCase();
    expect(cat?.cases).toHaveLength(3);
    categorize(tiers).cases[1].moveUp?.();
    expect(cat?.cases[0].then).toEqual({ path: 'tier' });
    categorize(tiers).cases[0].remove();
    expect(cat?.cases).toHaveLength(1);
  });

  test("a case whose value disagrees with the cases before it carries that issue; the value's own issues stay on the value", () => {
    const mixed: Categorization = {
      cases: [
        { if: big, then: 'x' },
        { if: big, then: { path: 'seats' } },
      ],
    };
    const root = categorize(mixed);
    expect(root.type).toBeNull();
    expect(root.cases[1].issues.map((i) => i.code)).toContain('value_type_mismatch');
    expect(root.cases[0].issues).toEqual([]);
    const outside = categorize({ cases: [{ if: big, then: { path: 'nope' } }] });
    expect(outside.cases[0].then.issues.length).toBeGreaterThan(0);
    expect(outside.cases[0].issues).toEqual([]);
  });

  test('match and default', () => {
    categorize(tiers).match.set('all');
    expect(cat?.match).toBe('all');
    categorize(tiers).removeDefault?.();
    expect(cat).not.toHaveProperty('default');
    expect(
      categorize(tiers, { acceptsType: (t: { kind: string | null }) => t.kind === 'String' })
        .accepted,
    ).toBe(true);
  });

  test('cleanCategorization cleans each case', () => {
    const cleaned = cleanCategorization(
      {
        cases: [
          {
            if: { field: 'seats', operator: Operator.equals, value: '5', __id: 'a' } as never,
            then: 1,
          },
        ],
      },
      view.lens,
    );
    expect(cleaned.cases[0].if).toEqual({
      field: 'seats',
      operator: Operator.equals,
      value: '5',
      coerceType: 'Int',
    });
  });
});
