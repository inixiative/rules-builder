import { describe, expect, test } from 'bun:test';
import {
  actionNamesByResource,
  addPath,
  emptyAction,
  removePath,
  removeTransitionAction,
  setTransitionAction,
  updateSide,
} from '../src/transitions/transitionTree';
import type { TransitionMap } from '../src/transitions/types';

const base = (): TransitionMap => ({
  'db:Inquiry': {
    approve: { paths: [{ from: { predicate: { all: [] } }, to: { predicate: { all: [] } } }] },
  },
});

describe('transition tree ops', () => {
  test('emptyAction starts with one empty edge', () => {
    expect(emptyAction()).toEqual({
      paths: [{ from: { predicate: { all: [] } }, to: { predicate: { all: [] } } }],
    });
  });

  test('actionNamesByResource lists actions per resource', () => {
    expect(actionNamesByResource(base())).toEqual({ 'db:Inquiry': ['approve'] });
  });

  test('setTransitionAction creates the resource + action', () => {
    const next = setTransitionAction({}, 'db:Order', 'ship', emptyAction());
    expect(next['db:Order'].ship.paths).toHaveLength(1);
  });

  test('removeTransitionAction drops the resource when its last action goes', () => {
    expect(removeTransitionAction(base(), 'db:Inquiry', 'approve')['db:Inquiry']).toBeUndefined();
  });

  test('addPath / removePath add and drop edges', () => {
    const two = addPath(base(), 'db:Inquiry', 'approve');
    expect(two['db:Inquiry'].approve.paths).toHaveLength(2);
    expect(removePath(two, 'db:Inquiry', 'approve', 0)['db:Inquiry'].approve.paths).toHaveLength(1);
  });

  test('updateSide updates a side immutably', () => {
    const s = base();
    const next = updateSide(s, 'db:Inquiry', 'approve', 0, 'to', (side) => ({
      ...side,
      merge: 'deepMerge',
    }));
    expect(next['db:Inquiry'].approve.paths[0].to.merge).toBe('deepMerge');
    expect(s['db:Inquiry'].approve.paths[0].to).toEqual({ predicate: { all: [] } }); // original untouched
  });
});
