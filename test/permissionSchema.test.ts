import { describe, expect, test } from 'bun:test';
import {
  actionNamesByResource,
  removeSchemaAction,
  setSchemaAction,
} from '../src/permissions/schema';
import type { RebacSchema } from '../src/permissions/types';

const base = (): RebacSchema => ({
  permissions: {
    'db:User': { actions: { own: null, read: 'own' } },
    'db:Organization': { actions: { manage: 'own' } },
  },
});

describe('actionNamesByResource', () => {
  test('lists every resource’s action names', () => {
    expect(actionNamesByResource(base())).toEqual({
      'db:User': ['own', 'read'],
      'db:Organization': ['manage'],
    });
  });
});

describe('setSchemaAction', () => {
  test('adds an action to an existing resource immutably', () => {
    const s = base();
    const next = setSchemaAction(s, 'db:User', 'manage', { self: 'id' });
    expect(next.permissions['db:User'].actions).toEqual({
      own: null,
      read: 'own',
      manage: { self: 'id' },
    });
    expect(s.permissions['db:User'].actions).toEqual({ own: null, read: 'own' });
  });

  test('creates the resource entry when absent', () => {
    expect(setSchemaAction({ permissions: {} }, 'db:Space', 'read', 'own')).toEqual({
      permissions: { 'db:Space': { actions: { read: 'own' } } },
    });
  });
});

describe('removeSchemaAction', () => {
  test('drops one action, keeping the resource', () => {
    expect(removeSchemaAction(base(), 'db:User', 'read').permissions['db:User'].actions).toEqual({
      own: null,
    });
  });

  test('drops the whole resource entry when its last action is removed', () => {
    expect(
      removeSchemaAction(base(), 'db:Organization', 'manage').permissions['db:Organization'],
    ).toBeUndefined();
  });
});
