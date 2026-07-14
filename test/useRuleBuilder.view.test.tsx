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
