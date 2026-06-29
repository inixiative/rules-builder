import { describe, expect, test } from 'bun:test';
import { actionNamesByModel, removeSchemaAction, setSchemaAction } from '../src/permissions/schema';
import type { RebacSchema } from '../src/permissions/types';

const base = (): RebacSchema => ({
  User: { actions: { own: null, read: 'own' } },
  Organization: { actions: { manage: 'own' } },
});

describe('actionNamesByModel', () => {
  test('lists every model’s action names', () => {
    expect(actionNamesByModel(base())).toEqual({ User: ['own', 'read'], Organization: ['manage'] });
  });
});

describe('setSchemaAction', () => {
  test('adds an action to an existing model immutably', () => {
    const s = base();
    const next = setSchemaAction(s, 'User', 'manage', { self: 'id' });
    expect(next.User.actions).toEqual({ own: null, read: 'own', manage: { self: 'id' } });
    expect(s.User.actions).toEqual({ own: null, read: 'own' });
  });

  test('creates the model entry when absent', () => {
    expect(setSchemaAction({}, 'Space', 'read', 'own')).toEqual({ Space: { actions: { read: 'own' } } });
  });
});

describe('removeSchemaAction', () => {
  test('drops one action, keeping the model', () => {
    expect(removeSchemaAction(base(), 'User', 'read').User.actions).toEqual({ own: null });
  });

  test('drops the whole model entry when its last action is removed', () => {
    expect(removeSchemaAction(base(), 'Organization', 'manage').Organization).toBeUndefined();
  });
});
