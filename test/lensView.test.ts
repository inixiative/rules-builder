import { describe, expect, test } from 'bun:test';
import { type Bridge, createLens, exposedSurface, type FieldMap } from '@inixiative/json-rules';
import { describeHoistedFields, type LensView } from '../src/schema/lensView';

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

  test('drops a path that crosses a list relation — a scalar hoist would silently mis-evaluate', () => {
    const withList = exposedSurface(
      createLens({
        maps: {
          prisma: {
            models: {
              User: { fields: { orders: { kind: 'object', type: 'Order', isList: true } } },
              Order: { fields: { total: { kind: 'scalar', type: 'Int' } } },
            },
          },
        },
        mapName: 'prisma',
        model: 'User',
      }),
    );
    expect(describeHoistedFields(withList, { roots: [{ path: 'orders.total' }] })).toEqual([]);
  });
});
