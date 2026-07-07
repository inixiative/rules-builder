import { afterEach, describe, expect, test } from 'bun:test';
import type { FieldMap } from '@inixiative/json-rules';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useFilteredCollection } from '../src/builder/useFilteredCollection';
import type { RuleBuilderSource } from '../src/schema/surface';

afterEach(cleanup);

const maps: Record<string, FieldMap> = {
  sdk: {
    models: {
      Reward: {
        fields: {
          id: { kind: 'scalar', type: 'String' },
          rewardType: { kind: 'scalar', type: 'String' },
          regionId: { kind: 'scalar', type: 'String' },
          regionName: { kind: 'scalar', type: 'String' },
          points: { kind: 'scalar', type: 'Int' },
          createdAt: { kind: 'scalar', type: 'DateTime' },
        },
      },
    },
  },
};

const rows = [
  {
    id: '1',
    rewardType: 'physical',
    regionId: 'us',
    regionName: 'United States',
    points: 5,
    createdAt: '2026-01-15T00:00:00.000Z',
  },
  {
    id: '2',
    rewardType: 'digital',
    regionId: 'eu',
    regionName: 'Europe',
    points: 25,
    createdAt: '2026-06-15T00:00:00.000Z',
  },
  {
    id: '3',
    rewardType: 'physical',
    regionId: 'us',
    regionName: 'United States',
    points: 50,
    createdAt: '2026-06-20T00:00:00.000Z',
  },
];

const source: RuleBuilderSource = { maps, mapName: 'sdk', model: 'Reward' };

describe('useFilteredCollection', () => {
  test('starts unfiltered and filters on setCondition', () => {
    const { result } = renderHook(() => useFilteredCollection({ source, rows }));
    expect(result.current.data).toHaveLength(3);

    act(() =>
      result.current.setCondition({ field: 'rewardType', operator: 'equals', value: 'physical' }),
    );
    expect(result.current.data.map((r) => r.id)).toEqual(['1', '3']);
  });

  test('emitted rules are coercion-stamped — widget-authored values match wire rows', () => {
    const { result } = renderHook(() => useFilteredCollection({ source, rows }));

    act(() =>
      result.current.setCondition({ field: 'points', operator: 'greaterThan', value: '10' }),
    );
    expect(result.current.value).toMatchObject({ coerceType: 'Int' });
    expect(result.current.data.map((r) => r.id)).toEqual(['2', '3']);

    act(() =>
      result.current.setCondition({
        field: 'createdAt',
        operator: 'greaterThanEquals',
        value: '2026-06-15',
      }),
    );
    expect(result.current.data.map((r) => r.id)).toEqual(['2', '3']);
  });

  test('sourced fields materialize options from the rows and round-trip through a rule', () => {
    const sourced: RuleBuilderSource = {
      ...source,
      narrowing: { root: { sources: { points: true } } },
    };
    const { result } = renderHook(() => useFilteredCollection({ source: sourced, rows }));

    const options = result.current.lens.maps.sdk.models.Reward.fields.points.options;
    expect(options?.map((o) => o.value)).toEqual(['5', '25', '50']);

    const picked = options?.[1].value;
    act(() => result.current.setCondition({ field: 'points', operator: 'equals', value: picked }));
    expect(result.current.data.map((r) => r.id)).toEqual(['2']);
  });

  test('a label SourceSpec decorates options with the sibling column', () => {
    const sourced: RuleBuilderSource = {
      ...source,
      narrowing: { root: { sources: { regionId: { label: 'regionName' } } } },
    };
    const { result } = renderHook(() => useFilteredCollection({ source: sourced, rows }));

    const options = result.current.lens.maps.sdk.models.Reward.fields.regionId.options;
    expect(options).toEqual([
      { value: 'eu', label: 'Europe' },
      { value: 'us', label: 'United States' },
    ]);
  });

  test('exposes the full builder surface (root descriptor tree) alongside data', () => {
    const { result } = renderHook(() => useFilteredCollection({ source, rows }));
    expect(result.current.root).toBeDefined();
    expect(result.current.value).toEqual({ all: [] });
  });

  test('search is case-insensitive and slightly fuzzy by default', () => {
    const { result } = renderHook(() => useFilteredCollection({ source, rows }));

    act(() =>
      result.current.setCondition({ field: 'regionName', operator: 'contains', value: 'united' }),
    );
    expect(result.current.data.map((r) => r.id)).toEqual(['1', '3']);

    // one-edit typo tolerated (unitd → united)
    act(() =>
      result.current.setCondition({
        field: 'regionName',
        operator: 'contains',
        value: 'unitd states',
      }),
    );
    expect(result.current.data.map((r) => r.id)).toEqual(['1', '3']);
  });

  test('caseInsensitive:false / fuzzy:false makes matching exact', () => {
    const { result } = renderHook(() =>
      useFilteredCollection({ source, rows, caseInsensitive: false, fuzzy: false }),
    );

    act(() =>
      result.current.setCondition({ field: 'regionName', operator: 'contains', value: 'united' }),
    );
    expect(result.current.data).toHaveLength(0);
  });
});
