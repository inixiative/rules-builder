import { describe, expect, test } from 'bun:test';
import {
  actionKind,
  addActionChild,
  childrenOfAction,
  defaultActionRule,
  getActionNode,
  isActionGroup,
  removeActionNode,
  setActionNode,
} from '../src/permissions/actionTree';
import type { ActionRule } from '../src/permissions/types';

describe('actionKind', () => {
  test('classifies every variant', () => {
    expect(actionKind('own')).toBe('delegate');
    expect(actionKind(null)).toBe('deny');
    expect(actionKind({ rel: 'organization', action: 'own' })).toBe('rel');
    expect(actionKind({ self: 'userId' })).toBe('self');
    expect(actionKind({ rule: { all: [] } })).toBe('rule');
    expect(actionKind({ any: [] })).toBe('any');
    expect(actionKind({ all: [] })).toBe('all');
  });
});

describe('childrenOfAction / isActionGroup', () => {
  test('group rules expose their members; leaves expose none', () => {
    expect(isActionGroup({ any: ['a'] })).toBe(true);
    expect(isActionGroup('own')).toBe(false);
    expect(childrenOfAction({ any: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(childrenOfAction({ all: [null] })).toEqual([null]);
    expect(childrenOfAction('own')).toEqual([]);
  });
});

describe('getActionNode', () => {
  test('navigates any/all by index', () => {
    const r: ActionRule = { any: ['own', { all: [{ self: 'userId' }] }] };
    expect(getActionNode(r, [])).toBe(r);
    expect(getActionNode(r, [0])).toBe('own');
    expect(getActionNode(r, [1, 0])).toEqual({ self: 'userId' });
    expect(getActionNode(r, [9])).toBeUndefined();
  });
});

describe('setActionNode', () => {
  test('replaces a node immutably', () => {
    const r: ActionRule = { all: ['own', 'manage'] };
    const next = setActionNode(r, [1], { self: 'id' });
    expect(next).toEqual({ all: ['own', { self: 'id' }] });
    expect(r).toEqual({ all: ['own', 'manage'] });
  });

  test('replaces the root at []', () => {
    expect(setActionNode('own', [], null)).toBe(null);
  });

  test('replaces a deeply nested node', () => {
    const r: ActionRule = { any: [{ all: ['own', 'manage'] }] };
    expect(setActionNode(r, [0, 1], { self: 'x' })).toEqual({
      any: [{ all: ['own', { self: 'x' }] }],
    });
  });
});

describe('addActionChild / removeActionNode', () => {
  test('addActionChild appends the default leaf to a group', () => {
    expect(addActionChild({ any: [] }, [])).toEqual({ any: [defaultActionRule()] });
  });

  test('removeActionNode drops a child by index', () => {
    expect(removeActionNode({ all: ['a', 'b', 'c'] }, [1])).toEqual({ all: ['a', 'c'] });
  });
});
