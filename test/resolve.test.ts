import { describe, expect, test } from 'bun:test';
import {
  type Condition,
  type FieldMap,
  validateNarrowing,
  validateRuleInLens,
} from '@inixiative/json-rules';
import {
  composeNarrowed,
  describeScopeFields,
  type NarrowingLayer,
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

const validateNarrowingChain = (
  source: Parameters<typeof composeNarrowed>[0],
  layer: NarrowingLayer,
): boolean => validateNarrowing({ parent: composeNarrowed(source), ...layer }).ok;

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

  test('the fetched set rides the visit at its path; the gate (view.lens) does not know it', () => {
    const view = resolve(source, { sourceValues });
    expect(view.visit('User')?.fields.tier.options?.map((o) => o.value)).toEqual([
      'gold',
      'silver',
    ]);
    const platinum: Condition = { field: 'tier', operator: 'equals', value: 'platinum' };
    expect(validateRuleInLens(platinum, view.lens).ok).toBe(true);
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

  test('the model defaults grow a tree: each model once, a second reach spelled', () => {
    const defaults = {
      app: { models: { User: { relations: { org: {} } }, Org: { relations: { users: {} } } } },
    };
    const root = viewRoot(resolve({ ...orgSource, narrowing: { mapDefaults: defaults } }));
    // Org.users leads back to User, the anchor: already reached.
    expect(names(describeScopeFields(viewAt(root, 'org')))).toEqual(['name']);
    const spelled = viewRoot(
      resolve({
        ...orgSource,
        narrowing: {
          mapDefaults: defaults,
          root: { relations: { org: { relations: { users: {} } } } },
        },
      }),
    );
    expect(names(describeScopeFields(viewAt(spelled, 'org')))).toEqual(['name', 'users']);
    // From the spelled node the tree grows again: User.org is on the spelled path, so off.
    expect(names(describeScopeFields(viewAt(spelled, 'org.users')))).toEqual(['name']);
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
    // Org's parent and users lead to models already on the path.
    expect(names(describeScopeFields(viewAt(viewRoot(view), 'org')))).toEqual(['name']);
  });
});

describe('withAllRelations — a later layer may spell past the tree', () => {
  test('a path a later layer spells is turned on in the first layer, and only there', () => {
    const later = {
      root: { picks: ['name'], relations: { org: { picks: ['name'], relations: { parent: {} } } } },
    };
    // Org at org.parent is past the model-default tree: the bare tree leaves it off.
    expect(validateNarrowingChain(withAllRelations({ ...orgSource, narrowing: [{}] }), later)).toBe(
      false,
    );
    const source = withAllRelations({ ...orgSource, narrowing: [{}, later] });
    const [first, second] = source.narrowing as NarrowingLayer[];
    expect(second).toBe(later);
    expect(first?.root?.relations?.org).toEqual({ relations: { parent: {} } });
    const view = resolve(source);
    expect(names(describeScopeFields(viewAt(viewRoot(view), 'org')))).toEqual(['name', 'parent']);
    expect(
      validateRuleInLens({ field: 'org.parent.name', operator: 'equals', value: 'x' }, view.lens)
        .ok,
    ).toBe(true);
    // The later layer's picks stay its own: the first layer turns on, it doesn't pick.
    expect(first?.root?.picks).toBeUndefined();
  });

  test('a first-layer node the later layer passes through keeps what it says', () => {
    const source = withAllRelations({
      ...orgSource,
      narrowing: [
        { root: { relations: { org: { omits: ['name'] } } } },
        { root: { relations: { org: { relations: { parent: {} } } } } },
      ],
    });
    const [first] = source.narrowing as NarrowingLayer[];
    expect(first?.root?.relations?.org).toEqual({ omits: ['name'], relations: { parent: {} } });
  });
});

describe('rawView — the record a permission or transition gates', () => {
  test('every relation of the record on, self-relations included; the gate agrees', () => {
    const orgView = rawView({ ...orgSource, model: 'Org' });
    const root = viewRoot(orgView);
    expect(names(describeScopeFields(root))).toEqual(['name', 'parent', 'users']);
    // users → User: its posts reached for the first time; its org leads back to Org.
    expect(names(describeScopeFields(viewAt(root, 'users')))).toEqual(['name', 'posts']);
    expect(
      validateRuleInLens({ field: 'parent.name', operator: 'equals', value: 'x' }, orgView.lens).ok,
    ).toBe(true);
    expect(
      validateRuleInLens(
        { field: 'parent.parent.name', operator: 'equals', value: 'x' },
        orgView.lens,
      ).ok,
    ).toBe(false);
    expect(orgView.visit('Org.parent.parent')).toBeUndefined();
  });
});
