import { describe, expect, test } from 'bun:test';
import {
  type Bridge,
  type Condition,
  check,
  createLens,
  exposedSurface,
  type FieldMap,
} from '@inixiative/json-rules';
import {
  describeHoistedFields,
  type LensView,
  matchNodeToRoot,
  viewConsumedTopFields,
} from '../src/schema/lensView';

const prisma: FieldMap = {
  models: {
    User: {
      fields: {
        id: { kind: 'scalar', type: 'String' },
        crmId: { kind: 'scalar', type: 'String' },
        tier: { kind: 'scalar', type: 'String', values: ['gold', 'silver'] },
        account: { kind: 'object', type: 'Account' },
      },
    },
    Account: {
      fields: {
        id: { kind: 'scalar', type: 'String' },
        industry: { kind: 'scalar', type: 'String' },
      },
    },
  },
};

const salesforce: FieldMap = {
  models: {
    Contact: {
      fields: {
        id: { kind: 'scalar', type: 'String' },
        arr: { kind: 'scalar', type: 'Int' },
      },
    },
  },
};

const bridges: Bridge[] = [
  {
    endpoints: [
      { fieldMap: 'salesforce', model: 'Contact', on: 'id' },
      { fieldMap: 'prisma', model: 'User', on: 'crmId' },
    ],
    cardinality: 'oneToMany',
  },
];

const lens = exposedSurface(
  createLens({ maps: { prisma, salesforce }, bridges, mapName: 'prisma', model: 'User' }),
);

const byName = (view: LensView) =>
  Object.fromEntries(describeHoistedFields(lens, view).map((f) => [f.name, f]));

describe('describeHoistedFields', () => {
  test('hoists a same-map relation leaf; name is the full path so emit is unchanged', () => {
    const f = byName({ roots: [{ path: 'account.industry' }] })['account.industry'];
    expect(f).toBeDefined();
    expect(f.kind).toBe('String');
    expect(f.operators.field).toContain('contains');
    // name === path is what makes ruleForField emit `field: 'account.industry'`.
    expect(f.name).toBe('account.industry');
  });

  test('hoists a bridge-crossing leaf from another source', () => {
    const f = byName({ roots: [{ path: 'salesforce:Contact.arr' }] })['salesforce:Contact.arr'];
    expect(f).toBeDefined();
    expect(f.kind).toBe('Int');
    expect(f.operators.field).toContain('between');
    expect(f.name).toBe('salesforce:Contact.arr');
  });

  test('inline label + icon on the entry override the raw field name', () => {
    const f = byName({
      roots: [{ path: 'salesforce:Contact.arr', label: 'Annual Revenue', icon: '💰' }],
    })['salesforce:Contact.arr'];
    expect(f.label).toBe('Annual Revenue');
    expect(f.icon).toBe('💰');
  });

  test('relabels via a structural key when no inline label is given', () => {
    const f = byName({
      roots: [{ path: 'account.industry' }],
      labels: { fields: { 'Account.industry': { label: 'Industry' } } },
    })['account.industry'];
    expect(f.label).toBe('Industry');
  });

  test('a path key wins over a structural key for the same field', () => {
    const f = byName({
      roots: [{ path: 'account.industry' }],
      labels: {
        fields: {
          'Account.industry': { label: 'Structural' },
          'account.industry': { label: 'Path' },
        },
      },
    })['account.industry'];
    expect(f.label).toBe('Path');
  });

  test('carries enum/pseudo-enum values through the hoist', () => {
    const f = byName({ roots: [{ path: 'tier' }] }).tier;
    expect(f.enumValues).toEqual(['gold', 'silver']);
  });

  test('drops an unresolvable path (scalar mid-segment or missing field)', () => {
    const out = describeHoistedFields(lens, {
      roots: [{ path: 'tier.nope' }, { path: 'account.missing' }, { path: 'ghost' }],
    });
    expect(out).toEqual([]);
  });
});

const eav = exposedSurface(
  createLens({
    maps: {
      prisma: {
        models: {
          User: {
            fields: {
              orders: { kind: 'object', type: 'Order', isList: true },
              customFields: { kind: 'object', type: 'CustomField', isList: true },
              account: { kind: 'object', type: 'Account' },
            },
          },
          Account: {
            fields: { contracts: { kind: 'object', type: 'Contract', isList: true } },
          },
          Contract: { fields: { amount: { kind: 'scalar', type: 'Int' } } },
          Order: { fields: { total: { kind: 'scalar', type: 'Int' } } },
          CustomField: {
            fields: {
              key: { kind: 'scalar', type: 'String' },
              value: { kind: 'scalar', type: 'String' },
            },
          },
        },
      },
    },
    mapName: 'prisma',
    model: 'User',
  }),
);

describe('describeHoistedFields — collection hoists', () => {
  test('a list-crossing path seeds an array node (never a broken flat leaf)', () => {
    const [f] = describeHoistedFields(eav, {
      roots: [{ path: 'orders.total', label: 'Order total' }],
    });
    expect(f.label).toBe('Order total');
    expect(f.isList).toBe(true);
    expect(f.seed).toMatchObject({
      field: 'orders',
      arrayOperator: 'any',
      condition: { all: [{ field: 'total' }] },
    });
    expect((f.seed as { filter?: unknown }).filter).toBeUndefined();
  });

  test('a sliced hoist bakes the slice into a locked filter and reasons over the value leaf', () => {
    const [f] = describeHoistedFields(eav, {
      roots: [
        {
          path: 'customFields.value',
          where: { field: 'key', operator: 'equals', value: 'nps' },
          kind: 'Int',
          label: 'NPS',
          icon: '📊',
        },
      ],
    });
    expect(f.label).toBe('NPS');
    expect(f.icon).toBe('📊');
    expect(f.seed).toMatchObject({
      field: 'customFields',
      arrayOperator: 'any',
      filter: { all: [{ field: 'key', operator: 'equals', value: 'nps' }] },
    });
    // kind override gives the value leaf numeric operators.
    const cond = (f.seed as { condition: { all: { operator: string }[] } }).condition;
    expect(cond.all[0]).toMatchObject({ field: 'value' });
  });

  test('the seeded sliced node evaluates correctly against real data', () => {
    const [f] = describeHoistedFields(eav, {
      roots: [
        {
          path: 'customFields.value',
          where: { field: 'key', operator: 'equals', value: 'nps' },
          kind: 'Int',
        },
      ],
    });
    const seed = f.seed as Condition;
    const rule = {
      ...seed,
      condition: { all: [{ field: 'value', operator: 'greaterThan', value: 5 }] },
    } as Condition;
    expect(
      check(rule, {
        customFields: [
          { key: 'nps', value: 9 },
          { key: 'tier', value: 1 },
        ],
      }),
    ).toBe(true);
    expect(check(rule, { customFields: [{ key: 'nps', value: 3 }] })).not.toBe(true);
  });

  test('multi-hop: reaches a list through a to-one relation and emits a resolver field', () => {
    const out = describeHoistedFields(eav, {
      roots: [{ path: 'account.contracts.amount', label: 'Contract value' }],
    });
    const selector = out.find((f) => f.seed);
    expect(selector?.label).toBe('Contract value');
    expect(selector?.seed).toMatchObject({
      field: 'account.contracts',
      arrayOperator: 'any',
      condition: { all: [{ field: 'amount' }] },
    });
    // a non-pickable resolver carries the relation so the seeded node resolves.
    const resolver = out.find((f) => f.name === 'account.contracts');
    expect(resolver?.selectable).toBe(false);
    expect(resolver?.relation).toMatchObject({ modelName: 'Contract' });
  });
});

describe('viewConsumedTopFields — move, not copy', () => {
  test('a whole-relation hoist consumes its top field; sliced/deep hoists leave the origin', () => {
    const consumed = viewConsumedTopFields({
      roots: [
        { path: 'orders' }, // whole → consumed
        { path: 'orders.total' }, // deep leaf → leaves orders
        { path: 'customFields.value', where: { field: 'key', operator: 'equals', value: 'x' } }, // sliced → leaves
      ],
    });
    expect([...consumed]).toEqual(['orders']);
  });
});

describe('matchNodeToRoot — round-trip', () => {
  const view: LensView = {
    roots: [
      { path: 'tier' },
      {
        path: 'customFields.value',
        where: { field: 'key', operator: 'equals', value: 'nps' },
        kind: 'Int',
        label: 'NPS',
      },
    ],
  };

  test('recognizes a saved sliced array node as its named root', () => {
    const node = {
      field: 'customFields',
      arrayOperator: 'any',
      filter: { all: [{ field: 'key', operator: 'equals', value: 'nps' }] },
      condition: { all: [{ field: 'value', operator: 'greaterThan', value: 5 }] },
    } as Condition;
    expect(matchNodeToRoot(eav, view, node)?.label).toBe('NPS');
  });

  test('does not match a different slice of the same relation', () => {
    const node = {
      field: 'customFields',
      arrayOperator: 'any',
      filter: { all: [{ field: 'key', operator: 'equals', value: 'tier' }] },
      condition: { all: [{ field: 'value', operator: 'equals', value: 'gold' }] },
    } as Condition;
    expect(matchNodeToRoot(eav, view, node)).toBeUndefined();
  });
});
