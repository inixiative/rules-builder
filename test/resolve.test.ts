import { describe, expect, test } from 'bun:test';
import { type Condition, type FieldMap, validateRuleInLens } from '@inixiative/json-rules';
import {
  describeScopeFields,
  rawView,
  resolve,
  viewAt,
  viewRoot,
  withAllRelations,
} from '../src/schema/surface';

const map: FieldMap = {
  models: {
    User: {
      fields: {
        email: { kind: 'scalar', type: 'String' },
        password: { kind: 'scalar', type: 'String' },
        role: { kind: 'enum', type: 'UserRole' },
        tier: { kind: 'scalar', type: 'String' },
      },
    },
  },
  enums: { UserRole: ['admin', 'member', 'guest'] },
};

const names = (fields: { name: string }[]) => fields.map((f) => f.name).sort();

describe('resolve — serializable source → view', () => {
  test('a bare source shows the anchor columns', () => {
    const view = resolve({ maps: { app: map }, mapName: 'app', model: 'User' });
    expect(names(describeScopeFields(viewRoot(view)))).toEqual([
      'email',
      'password',
      'role',
      'tier',
    ]);
  });

  test('applies a parent-less narrowing and does not leak the omitted field', () => {
    const view = resolve({
      maps: { app: map },
      mapName: 'app',
      model: 'User',
      narrowing: { mapDefaults: { app: { models: { User: { omits: ['password'] } } } } },
    });
    expect(names(describeScopeFields(viewRoot(view)))).toEqual(['email', 'role', 'tier']);
  });
});

describe('resolve — fetched sourceValues fold onto the view and the gate', () => {
  const source = { maps: { app: map }, mapName: 'app', model: 'User' };
  const sourceValues = [
    {
      path: 'User',
      mapName: 'app',
      model: 'User',
      field: 'tier',
      options: [{ value: 'gold' }, { value: 'silver' }],
    },
  ];

  test('fetched values surface as enumValues, kind preserved', () => {
    const view = resolve(source, { sourceValues });
    const tier = describeScopeFields(viewRoot(view)).find((f) => f.name === 'tier');
    expect(tier?.enumValues).toEqual(['gold', 'silver']);
    expect(tier?.kind).toBe('String'); // keeps native operators
  });

  test('the gate (view.lens) refuses a value outside the fetched set', () => {
    const { lens } = resolve(source, { sourceValues });
    const good: Condition = { all: [{ field: 'tier', operator: 'equals', value: 'gold' }] };
    const bad: Condition = { all: [{ field: 'tier', operator: 'equals', value: 'platinum' }] };
    expect(validateRuleInLens(good, lens).ok).toBe(true);
    expect(validateRuleInLens(bad, lens).ok).toBe(false);
  });

  test('the caller maps are never mutated', () => {
    resolve(source, { sourceValues });
    expect(map.models.User.fields.tier.options).toBeUndefined();
  });
});

const orgMap: FieldMap = {
  models: {
    User: {
      fields: {
        name: { kind: 'scalar', type: 'String' },
        org: { kind: 'object', type: 'Org' },
        posts: { kind: 'object', type: 'Post', isList: true },
      },
    },
    Org: {
      fields: {
        name: { kind: 'scalar', type: 'String' },
        parent: { kind: 'object', type: 'Org' },
        users: { kind: 'object', type: 'User', isList: true },
      },
    },
    Post: { fields: { title: { kind: 'scalar', type: 'String' } } },
  },
};
const orgSource = { maps: { app: orgMap }, mapName: 'app', model: 'User' };

describe('relations — off until the narrowing turns them on (json-rules 3.4)', () => {
  test('a bare source shows no relation', () => {
    const view = resolve(orgSource);
    expect(names(describeScopeFields(viewRoot(view)))).toEqual(['name']);
    expect(view.visit('User.org')).toBeUndefined();
  });

  test('root.relations turns a relation on along the path, and each visit shows its own', () => {
    const view = resolve({
      ...orgSource,
      narrowing: { root: { relations: { org: { relations: { parent: {} } } } } },
    });
    const root = viewRoot(view);
    expect(names(describeScopeFields(root))).toEqual(['name', 'org']);
    expect(names(describeScopeFields(viewAt(root, 'org')))).toEqual(['name', 'parent']);
    // Org at org.parent: nothing spelled below it, so no relation is on there.
    expect(names(describeScopeFields(viewAt(root, 'org.parent')))).toEqual(['name']);
    expect(view.visit('User.posts')).toBeUndefined();
  });

  test('a model-default relation crosses each edge once per path', () => {
    const view = resolve({
      ...orgSource,
      narrowing: {
        mapDefaults: {
          app: { models: { User: { relations: { org: {} } }, Org: { relations: { users: {} } } } },
        },
      },
    });
    const root = viewRoot(view);
    expect(names(describeScopeFields(viewAt(root, 'org')))).toEqual(['name', 'users']);
    // User.org was crossed on the way to org.users — off there.
    expect(names(describeScopeFields(viewAt(root, 'org.users')))).toEqual(['name']);
  });
});

describe('a layered narrowing — a chain, outermost first', () => {
  test('a later layer narrows what the first turned on, and the gate is the whole chain', () => {
    const view = resolve({
      ...orgSource,
      narrowing: [{ root: { relations: { org: {}, posts: {} } } }, { root: { omits: ['posts'] } }],
    });
    expect(names(describeScopeFields(viewRoot(view)))).toEqual(['name', 'org']);
    const posts: Condition = { field: 'posts', arrayOperator: 'notEmpty' };
    expect(validateRuleInLens(posts, view.lens).ok).toBe(false);
  });

  test('withAllRelations turns relations on in the first layer and keeps the later ones', () => {
    const source = withAllRelations({
      ...orgSource,
      narrowing: [{}, { root: { omits: ['posts'] } }],
    });
    const view = resolve(source);
    expect(names(describeScopeFields(viewRoot(view)))).toEqual(['name', 'org']);
    expect(names(describeScopeFields(viewAt(viewRoot(view), 'org')))).toEqual([
      'name',
      'parent',
      'users',
    ]);
  });
});

describe('rawView — the record a permission or transition gates', () => {
  test('every relation on, each edge once per path; the gate agrees', () => {
    const view = rawView(orgSource);
    const root = viewRoot(view);
    expect(names(describeScopeFields(root))).toEqual(['name', 'org', 'posts']);
    expect(names(describeScopeFields(viewAt(root, 'org')))).toEqual(['name', 'parent', 'users']);
    // Org.parent already crossed at org.parent.
    expect(names(describeScopeFields(viewAt(root, 'org.parent')))).toEqual(['name', 'users']);
    expect(view.visit('User.org.users.org')).toBeUndefined();
    expect(
      validateRuleInLens({ field: 'org.parent.name', operator: 'equals', value: 'x' }, view.lens)
        .ok,
    ).toBe(true);
    expect(
      validateRuleInLens(
        { field: 'org.parent.parent.name', operator: 'equals', value: 'x' },
        view.lens,
      ).ok,
    ).toBe(false);
  });
});
