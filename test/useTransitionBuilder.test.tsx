import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { FieldMap } from '@inixiative/json-rules';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { emptyAction } from '../src/transitions/transitionTree';
import type { TransitionMap } from '../src/transitions/types';
import { useTransitionBuilder } from '../src/transitions/useTransitionBuilder';

afterEach(cleanup);

const map: FieldMap = {
  models: {
    User: {
      fields: {
        tier: { kind: 'scalar', type: 'String', values: ['gold', 'silver'] },
        status: { kind: 'enum', type: 'Status' },
      },
    },
  },
  enums: { Status: ['draft', 'live'] },
};
const maps = { app: map };

const useControlled = (initial: TransitionMap) => {
  const [value, setValue] = useState<TransitionMap>(initial);
  return useTransitionBuilder({ value, onChange: setValue, maps });
};

const withOneAction = (): TransitionMap => ({ 'app:User': { submit: emptyAction() } });

describe('useTransitionBuilder — controlled tracking', () => {
  test('reflects the value prop; onChange never fires on render', () => {
    const onChange = mock<(s: TransitionMap) => void>();
    const { result } = renderHook(() =>
      useTransitionBuilder({ value: withOneAction(), onChange, maps }),
    );
    expect(result.current.resources).toEqual(['app:User']);
    expect(result.current.actionsOf('app:User')).toEqual(['submit']);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('useTransitionBuilder — resource / action / path edits', () => {
  test('addAction seeds an action with a single empty edge (path)', () => {
    const { result } = renderHook(() => useControlled({}));
    act(() => result.current.addAction('app:User', 'submit'));
    expect(result.current.actionsOf('app:User')).toEqual(['submit']);
    expect(result.current.pathCount('app:User', 'submit')).toBe(1);
  });

  test('addPath / removePath adjust the edge count', () => {
    const { result } = renderHook(() => useControlled(withOneAction()));
    act(() => result.current.addPath('app:User', 'submit'));
    expect(result.current.pathCount('app:User', 'submit')).toBe(2);
    act(() => result.current.removePath('app:User', 'submit', 1));
    expect(result.current.pathCount('app:User', 'submit')).toBe(1);
  });

  test('removeAction drops the action (and prunes the empty resource)', () => {
    const { result } = renderHook(() => useControlled(withOneAction()));
    act(() => result.current.removeAction('app:User', 'submit'));
    expect(result.current.resources).toEqual([]);
  });
});

describe('useTransitionBuilder — predicate descriptors', () => {
  test('predicateRoot builds a json-rules group over a side; edits round-trip into the predicate', () => {
    const { result } = renderHook(() => useControlled(withOneAction()));
    const root = result.current.predicateRoot('app:User', 'submit', 0, 'from');
    expect(root?.kind).toBe('group');
    act(() => (root as { addRule: () => void }).addRule());
    const predicate = result.current.value['app:User'].submit.paths[0].from.predicate as {
      all: unknown[];
    };
    expect(predicate.all).toHaveLength(1);
  });

  test('predicateRoot is null for a missing edge or a resource absent from the maps', () => {
    const { result } = renderHook(() =>
      useControlled({
        'app:User': { submit: emptyAction() },
        'app:Ghost': { submit: emptyAction() },
      }),
    );
    expect(result.current.predicateRoot('app:User', 'submit', 5, 'from')).toBeNull(); // no path index 5
    expect(result.current.predicateRoot('app:Ghost', 'submit', 0, 'from')).toBeNull(); // not in the maps
  });
});

describe('useTransitionBuilder — per-side permission', () => {
  test('enable / clear toggles a side’s permission and its descriptor', () => {
    const { result } = renderHook(() => useControlled(withOneAction()));
    expect(result.current.permissionHas('app:User', 'submit', 0, 'from')).toBe(false);
    expect(result.current.permissionRoot('app:User', 'submit', 0, 'from')).toBeNull();

    act(() => result.current.enablePermission('app:User', 'submit', 0, 'from'));
    expect(result.current.permissionHas('app:User', 'submit', 0, 'from')).toBe(true);
    expect(result.current.value['app:User'].submit.paths[0].from.permission).toEqual({
      rule: { all: [] },
    });
    expect(result.current.permissionRoot('app:User', 'submit', 0, 'from')?.kind.value).toBe('rule');

    act(() => result.current.clearPermission('app:User', 'submit', 0, 'from'));
    expect(result.current.permissionHas('app:User', 'submit', 0, 'from')).toBe(false);
  });
});

describe('useTransitionBuilder — serializable merge strategy', () => {
  test('setMerge sets and clears the `to` side merge strategy', () => {
    const { result } = renderHook(() => useControlled(withOneAction()));
    expect(result.current.mergeOf('app:User', 'submit', 0)).toBeUndefined();

    act(() => result.current.setMerge('app:User', 'submit', 0, 'deepMerge'));
    expect(result.current.mergeOf('app:User', 'submit', 0)).toBe('deepMerge');
    expect(result.current.value['app:User'].submit.paths[0].to.merge).toBe('deepMerge');

    act(() => result.current.setMerge('app:User', 'submit', 0, { kind: 'append', path: 'log' }));
    expect(result.current.mergeOf('app:User', 'submit', 0)).toEqual({
      kind: 'append',
      path: 'log',
    });

    act(() => result.current.setMerge('app:User', 'submit', 0, undefined));
    expect(result.current.mergeOf('app:User', 'submit', 0)).toBeUndefined();
  });
});
