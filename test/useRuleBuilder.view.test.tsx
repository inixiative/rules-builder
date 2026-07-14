import { afterEach, describe, expect, test } from 'bun:test';
import type { Bridge, Condition, FieldMap } from '@inixiative/json-rules';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { GroupNode, LeafNode } from '../src/builder/buildNodes';
import { useRuleBuilder } from '../src/builder/useRuleBuilder';
import type { LensView } from '../src/schema/lensView';

afterEach(cleanup);

const prisma: FieldMap = {
  models: {
    User: {
      fields: {
        tier: { kind: 'scalar', type: 'String', values: ['gold', 'silver'] },
        crmId: { kind: 'scalar', type: 'String' },
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
const source = { maps: { prisma, salesforce }, bridges, mapName: 'prisma', model: 'User' };

const view: LensView = {
  roots: [{ path: 'salesforce:Contact.arr', label: 'Annual Revenue', icon: '💰' }],
};

const rootGroup = (r: { root: unknown }) => r.root as GroupNode;
const seed: Condition = { all: [{ field: 'tier', operator: 'equals', value: 'gold' }] };

describe('useRuleBuilder — view (hoisted roots)', () => {
  test('a hoisted bridge path shows up as a labeled root selector option', () => {
    const { result } = renderHook(() => useRuleBuilder({ source, view, defaultValue: seed }));
    const leaf = rootGroup(result.current).children[0] as LeafNode;
    const option = leaf.field.options.find((o) => o.value === 'salesforce:Contact.arr');
    expect(option).toBeDefined();
    expect(option?.label).toBe('Annual Revenue');
    // the anchor model's own field is still offered — additive, not a replace.
    expect(leaf.field.options.some((o) => o.value === 'tier')).toBe(true);
  });

  test('selecting a hoisted root emits the real dotted path as the rule field', () => {
    const { result } = renderHook(() => useRuleBuilder({ source, view, defaultValue: seed }));
    const leaf = rootGroup(result.current).children[0] as LeafNode;
    act(() => leaf.field.set('salesforce:Contact.arr'));
    const emitted = (result.current.value as { all: Condition[] }).all[0] as {
      field: string;
      coerceType?: string;
    };
    expect(emitted.field).toBe('salesforce:Contact.arr');
    expect(emitted.coerceType).toBe('Int');
  });

  test('a seeded rule on a hoisted path resolves back as a valid, labeled row', () => {
    const defaultValue: Condition = {
      all: [{ field: 'salesforce:Contact.arr', operator: 'greaterThan', value: 1000 }],
    };
    const { result } = renderHook(() => useRuleBuilder({ source, view, defaultValue }));
    const leaf = rootGroup(result.current).children[0] as LeafNode;
    expect(leaf.field.value).toBe('salesforce:Contact.arr');
    expect(leaf.field.valid).toBe(true);
    expect(leaf.valid).toBe(true);
  });
});

const eavMap: FieldMap = {
  models: {
    User: {
      fields: {
        tier: { kind: 'scalar', type: 'String', values: ['gold', 'silver'] },
        customFields: { kind: 'object', type: 'CustomField', isList: true },
      },
    },
    CustomField: {
      fields: {
        key: { kind: 'scalar', type: 'String' },
        value: { kind: 'scalar', type: 'String' },
      },
    },
  },
};
const eavSource = { maps: { app: eavMap }, mapName: 'app', model: 'User' };
const npsView: LensView = {
  roots: [
    {
      path: 'customFields.value',
      slice: { field: 'key', operator: 'equals', value: 'nps' },
      kind: 'Int',
      label: 'NPS',
    },
  ],
};

describe('useRuleBuilder — collection & sliced hoists', () => {
  test('selecting a sliced hoist seeds a locked-filter array node reasoning over the value', () => {
    const seed: Condition = { all: [{ field: 'tier', operator: 'equals', value: 'gold' }] };
    const { result } = renderHook(() =>
      useRuleBuilder({ source: eavSource, view: npsView, defaultValue: seed }),
    );
    const row = rootGroup(result.current).children[0] as LeafNode;
    const npsOption = row.field.options.find((o) => o.label === 'NPS');
    if (!npsOption) throw new Error('NPS option not offered');
    act(() => row.field.set(npsOption.value));
    const node = (result.current.value as { all: Condition[] }).all[0] as {
      field: string;
      arrayOperator: string;
      filter: unknown;
    };
    expect(node.field).toBe('customFields');
    expect(node.arrayOperator).toBe('any');
    expect(node.filter).toMatchObject({
      all: [{ field: 'key', operator: 'equals', value: 'nps' }],
    });
  });

  test('a wholesale-hoisted top relation is removed from the root selector (move, not copy)', () => {
    const seed: Condition = { all: [{ field: 'tier', operator: 'equals', value: 'gold' }] };
    const view: LensView = { roots: [{ path: 'customFields', label: 'Enrichments' }] };
    const { result } = renderHook(() =>
      useRuleBuilder({ source: eavSource, view, defaultValue: seed }),
    );
    const row = rootGroup(result.current).children[0] as LeafNode;
    const values = row.field.options.map((o) => o.value);
    // the hoisted "Enrichments" entry is present; the raw `customFields` is gone.
    expect(values).toContain('customFields'); // the hoist's own id is the path
    expect(row.field.options.filter((o) => o.value === 'customFields')).toHaveLength(1);
    expect(row.field.options.find((o) => o.value === 'customFields')?.label).toBe('Enrichments');
  });
});
