import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { FieldMap } from '@inixiative/json-rules';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useState } from 'react';
import type { RebacSchema } from '../src/permissions/types';
import {
  type UsePermissionBuilderOptions,
  usePermissionBuilder,
} from '../src/permissions/usePermissionBuilder';

afterEach(cleanup);

const map: FieldMap = {
  models: {
    User: {
      fields: {
        tier: { kind: 'scalar', type: 'String', values: ['gold', 'silver'] },
        account: { kind: 'object', type: 'Account' },
      },
    },
    Account: { fields: { industry: { kind: 'scalar', type: 'String' } } },
  },
};
const maps = { app: map };

// A stateful harness so the controlled value/onChange round-trips through React state.
const useControlled = (initial: RebacSchema) => {
  const [value, setValue] = useState<RebacSchema>(initial);
  return usePermissionBuilder({ value, onChange: setValue, maps });
};

const empty: RebacSchema = { permissions: {} };

describe('usePermissionBuilder — controlled tracking', () => {
  test('reflects the value prop and re-tracks it when the prop changes', () => {
    const a: RebacSchema = { permissions: { 'app:User': { actions: {} } } };
    const b: RebacSchema = { permissions: { 'app:Account': { actions: { read: true } } } };
    const { result, rerender } = renderHook(
      (p: UsePermissionBuilderOptions) => usePermissionBuilder(p),
      {
        initialProps: { value: a, onChange: () => {}, maps },
      },
    );
    expect(result.current.resources).toEqual(['app:User']);
    rerender({ value: b, onChange: () => {}, maps });
    expect(result.current.resources).toEqual(['app:Account']);
    expect(result.current.actionsOf('app:Account')).toEqual(['read']);
  });

  test('onChange never fires on render (fully controlled — no seed effect)', () => {
    const onChange = mock<(s: RebacSchema) => void>();
    renderHook(() => usePermissionBuilder({ value: empty, onChange, maps }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('usePermissionBuilder — resource + action edits', () => {
  test('addResource emits a new schema with the empty resource', () => {
    const onChange = mock<(s: RebacSchema) => void>();
    const { result } = renderHook(() => usePermissionBuilder({ value: empty, onChange, maps }));
    act(() => result.current.addResource('app:User'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual({ permissions: { 'app:User': { actions: {} } } });
  });

  test('addAction seeds the default ABAC leaf; round-trips into actionsOf', () => {
    const { result } = renderHook(() =>
      useControlled({ permissions: { 'app:User': { actions: {} } } }),
    );
    act(() => result.current.addAction('app:User', 'read'));
    expect(result.current.actionsOf('app:User')).toEqual(['read']);
    expect(result.current.value.permissions['app:User'].actions.read).toEqual({
      rule: { all: [] },
    });
  });

  test('addAction is a no-op for an empty name or an existing action', () => {
    const onChange = mock<(s: RebacSchema) => void>();
    const seeded: RebacSchema = { permissions: { 'app:User': { actions: { read: true } } } };
    const { result } = renderHook(() => usePermissionBuilder({ value: seeded, onChange, maps }));
    act(() => result.current.addAction('app:User', ''));
    act(() => result.current.addAction('app:User', 'read'));
    expect(onChange).not.toHaveBeenCalled();
  });

  test('removeAction and removeResource round-trip through the schema', () => {
    const { result } = renderHook(() =>
      useControlled({ permissions: { 'app:User': { actions: { read: true, write: false } } } }),
    );
    act(() => result.current.removeAction('app:User', 'write'));
    expect(result.current.actionsOf('app:User')).toEqual(['read']);
    act(() => result.current.removeResource('app:User'));
    expect(result.current.resources).toEqual([]);
  });

  test('setAction replaces the whole rule and round-trips', () => {
    const { result } = renderHook(() =>
      useControlled({ permissions: { 'app:User': { actions: { read: true } } } }),
    );
    act(() => result.current.setAction('app:User', 'read', { self: 'ownerId' }));
    expect(result.current.value.permissions['app:User'].actions.read).toEqual({ self: 'ownerId' });
  });
});

describe('usePermissionBuilder — actionRoot descriptors', () => {
  test('returns a descriptor for a known resource.action', () => {
    const { result } = renderHook(() =>
      useControlled({ permissions: { 'app:User': { actions: { read: { rule: { all: [] } } } } } }),
    );
    const node = result.current.actionRoot('app:User', 'read');
    expect(node).not.toBeNull();
    expect(node?.kind.value).toBe('rule');
  });

  test('returns null for an unknown action or a resource absent from the maps', () => {
    const { result } = renderHook(() =>
      useControlled({
        permissions: {
          'app:User': { actions: { read: true } },
          'app:Ghost': { actions: { read: true } },
        },
      }),
    );
    expect(result.current.actionRoot('app:User', 'missing')).toBeNull();
    expect(result.current.actionRoot('app:Ghost', 'read')).toBeNull(); // Ghost is not in the maps
  });

  test('actionsByResource enumerates every resource’s action names (delegate/rel awareness)', () => {
    const { result } = renderHook(() =>
      useControlled({ permissions: { 'app:User': { actions: { read: true, write: false } } } }),
    );
    expect(result.current.actionsByResource).toEqual({ 'app:User': ['read', 'write'] });
  });
});
