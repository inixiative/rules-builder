import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { FieldMap } from '@inixiative/json-rules';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ActionGroupNode, ActionLeafNode } from '../src/permissions/buildActionRoot';
import type { ActionRule } from '../src/permissions/types';
import { useActionRuleBuilder, type UseActionRuleBuilderOptions } from '../src/permissions/useActionRuleBuilder';

afterEach(cleanup);

const map: FieldMap = {
  models: {
    User: {
      fields: {
        tier: { kind: 'scalar', type: 'String', values: ['gold', 'silver'] },
        ownerId: { kind: 'scalar', type: 'String' },
        account: { kind: 'object', type: 'Account' },
      },
    },
    Account: { fields: { industry: { kind: 'scalar', type: 'String' } } },
  },
};
const source = { maps: { app: map }, mapName: 'app', model: 'User' };

describe('useActionRuleBuilder — seed / defaultValue semantics', () => {
  test('with no defaultValue, seeds the default ABAC leaf { rule: { all: [] } }', () => {
    const { result } = renderHook(() => useActionRuleBuilder({ source }));
    expect(result.current.value).toEqual({ rule: { all: [] } });
    expect(result.current.root.kind.value).toBe('rule');
  });

  test('seeds from defaultValue once; a later prop change does NOT re-seed', () => {
    const { result, rerender } = renderHook((p: UseActionRuleBuilderOptions) => useActionRuleBuilder(p), {
      initialProps: { source, defaultValue: true as ActionRule },
    });
    expect(result.current.value).toBe(true);
    rerender({ source, defaultValue: false as ActionRule });
    expect(result.current.value).toBe(true);
  });
});

describe('useActionRuleBuilder — onChange lifecycle', () => {
  test('suppressed on first render, fires on an edit, emits the raw ActionRule', () => {
    const onChange = mock<(r: ActionRule) => void>();
    const { result } = renderHook(() => useActionRuleBuilder({ source, onChange }));
    expect(onChange).not.toHaveBeenCalled();

    act(() => result.current.root.kind.set('allow'));
    expect(result.current.value).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(true);
  });
});

describe('useActionRuleBuilder — descriptor-tree actions', () => {
  test('kind.set switches the leaf to each terminal / composite shape', () => {
    const { result } = renderHook(() => useActionRuleBuilder({ source }));
    act(() => result.current.root.kind.set('deny'));
    expect(result.current.value).toBe(false);
    act(() => result.current.root.kind.set('all'));
    expect(result.current.value).toEqual({ all: [] });
  });

  test('a group node adds children; addChild is gated on depth', () => {
    const { result } = renderHook(() => useActionRuleBuilder({ source, defaultValue: { all: [] } }));
    const root = result.current.root as ActionGroupNode;
    expect(root.children).toHaveLength(0);
    act(() => root.addChild?.());
    const grown = result.current.root as ActionGroupNode;
    expect(grown.children).toHaveLength(1);
    // a freshly added child is the default ABAC leaf
    expect(grown.children[0].kind.value).toBe('rule');
  });

  test('self leaf offers non-relation fields and commits { self: field }', () => {
    const { result } = renderHook(() => useActionRuleBuilder({ source, defaultValue: { self: '' } }));
    const root = result.current.root as ActionLeafNode;
    expect(root.self?.options.map((o) => o.value)).toEqual(['tier', 'ownerId']);
    act(() => root.self?.set('ownerId'));
    expect(result.current.value).toEqual({ self: 'ownerId' });
  });

  test('rel leaf resolves the hop target and offers that resource’s actions', () => {
    const { result } = renderHook(() =>
      useActionRuleBuilder({
        source,
        defaultValue: { rel: 'account', action: '' },
        actionsByResource: { 'app:Account': ['read', 'write'] },
      }),
    );
    const root = result.current.root as ActionLeafNode;
    expect(root.rel?.segments[0]?.value).toBe('account');
    expect(root.rel?.target).toBe('app:Account');
    expect(root.rel?.action.options.map((o) => o.value)).toEqual(['read', 'write']);
    act(() => root.rel?.action.set('read'));
    expect(result.current.value).toEqual({ rel: 'account', action: 'read' });
  });

  test('the ABAC rule leaf embeds a json-rules builder whose edits fold back under { rule }', () => {
    const { result } = renderHook(() => useActionRuleBuilder({ source, defaultValue: { rule: { all: [] } } }));
    const root = result.current.root as ActionLeafNode;
    expect(root.rule?.kind).toBe('group');
    act(() => (root.rule as { addRule: () => void }).addRule());
    const rule = (result.current.value as { rule: { all: unknown[] } }).rule;
    expect(rule.all).toHaveLength(1);
  });
});

describe('useActionRuleBuilder — memoization', () => {
  test('root is referentially stable across a no-op re-render', () => {
    const props: UseActionRuleBuilderOptions = { source, defaultValue: { all: [] } };
    const { result, rerender } = renderHook((p: UseActionRuleBuilderOptions) => useActionRuleBuilder(p), {
      initialProps: props,
    });
    const first = result.current.root;
    rerender(props);
    expect(result.current.root).toBe(first);
  });
});
