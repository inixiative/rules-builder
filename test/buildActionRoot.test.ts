import { describe, expect, test } from 'bun:test';
import type { FieldMap } from '@inixiative/json-rules';
import { type ActionGroupNode, type ActionLeafNode, buildActionRoot } from '../src/permissions/buildActionRoot';
import type { ActionRule } from '../src/permissions/types';
import { describeModelFields, resolve } from '../src/schema/surface';

const map: FieldMap = {
  models: {
    User: {
      fields: {
        id: { kind: 'scalar', type: 'String' },
        userId: { kind: 'scalar', type: 'String' },
        role: { kind: 'enum', type: 'Role' },
        organization: { kind: 'object', type: 'Organization' }, // to-one — walkable
        posts: { kind: 'object', type: 'Post', isList: true }, // to-many — NOT walkable
      },
    },
    Organization: {
      fields: {
        id: { kind: 'scalar', type: 'String' },
        name: { kind: 'scalar', type: 'String' },
        parent: { kind: 'object', type: 'Organization' }, // to-one self-ref — for multi-hop
      },
    },
    Post: { fields: { id: { kind: 'scalar', type: 'String' } } },
  },
  enums: { Role: ['owner', 'admin', 'member'] },
};

const lens = resolve({ maps: { app: map }, mapName: 'app', model: 'User' });
const fields = describeModelFields(lens, 'app', 'User');
const actionsByResource = { 'app:User': ['own', 'manage', 'read'], 'app:Organization': ['own', 'manage', 'read'] };
const resourceFields = (res: string) => {
  const [m, mdl] = res.split(':');
  return describeModelFields(resolve({ maps: { app: map }, mapName: m, model: mdl }), m, mdl);
};

let committed: ActionRule | undefined;
const build = (rule: ActionRule) => {
  committed = undefined;
  return buildActionRoot(rule, {
    lens,
    fields,
    siblingActions: ['manage', 'read'],
    actionsByResource,
    resourceFields,
    maxDepth: 4,
    commit: (next) => {
      committed = next;
    },
  });
};

describe('buildActionRoot — model-aware leaves', () => {
  test('delegate offers sibling actions', () => {
    const n = build('manage') as ActionLeafNode;
    expect(n.kind.value).toBe('delegate');
    expect(n.delegate?.value).toBe('manage');
    expect(n.delegate?.options.map((o) => o.value)).toEqual(['manage', 'read']);
  });

  test('self offers the model’s non-relation fields', () => {
    const n = build({ self: 'userId' }) as ActionLeafNode;
    expect(n.kind.value).toBe('self');
    expect(n.self?.value).toBe('userId');
    expect(n.self?.options.map((o) => o.value).sort()).toEqual(['id', 'role', 'userId']);
  });

  test('rel single hop offers only to-one relations (excludes the "many" side) + the target’s actions', () => {
    const n = build({ rel: 'organization', action: 'own' }) as ActionLeafNode;
    expect(n.kind.value).toBe('rel');
    expect(n.rel?.segments.map((s) => s.value)).toEqual(['organization']);
    // `posts` (a list / "many" side) is excluded — only to-one relations are walkable
    expect(n.rel?.segments[0].options.map((o) => o.value)).toEqual(['organization']);
    expect(n.rel?.target).toBe('app:Organization');
    expect(n.rel?.action.options.map((o) => o.value)).toEqual(['own', 'manage', 'read']);
    expect(n.rel?.action.value).toBe('own');
  });

  test('rel multi-hop scopes each segment to the resource reached', () => {
    const n = build({ rel: 'organization.parent', action: 'own' }) as ActionLeafNode;
    expect(n.rel?.segments.map((s) => s.value)).toEqual(['organization', 'parent']);
    expect(n.rel?.segments[0].options.map((o) => o.value)).toEqual(['organization']); // User's to-one
    expect(n.rel?.segments[1].options.map((o) => o.value)).toEqual(['parent']); // Organization's to-one
    expect(n.rel?.target).toBe('app:Organization');
    // appending a hop extends the dotted path
    n.rel?.addSegment('parent');
    expect((committed as { rel: string }).rel).toBe('organization.parent.parent');
  });

  test('changing the relation path resets the action — a stale action would belong to the old target', () => {
    // organization → Organization; picking action 'manage' is valid there.
    const n = build({ rel: 'organization', action: 'manage' }) as ActionLeafNode;
    // appending a hop changes the target's actions; the prior pick must not survive stale.
    n.rel?.addSegment('parent');
    expect(committed).toEqual({ rel: 'organization.parent', action: '' });
  });

  test('editing a segment resets the action', () => {
    const n = build({ rel: 'organization.parent', action: 'own' }) as ActionLeafNode;
    n.rel?.segments[0].set('organization');
    expect(committed).toEqual({ rel: 'organization', action: '' });
  });

  test('removing the last hop resets the action', () => {
    const n = build({ rel: 'organization.parent', action: 'own' }) as ActionLeafNode;
    n.rel?.removeLast?.();
    expect(committed).toEqual({ rel: 'organization', action: '' });
  });

  test('picking the action keeps the relation path', () => {
    const n = build({ rel: 'organization', action: '' }) as ActionLeafNode;
    n.rel?.action.set('manage');
    expect(committed).toEqual({ rel: 'organization', action: 'manage' });
  });

  test('rule embeds a condition builder (a group node)', () => {
    const n = build({ rule: { all: [{ field: 'role', operator: 'equals', value: 'admin' }] } }) as ActionLeafNode;
    expect(n.kind.value).toBe('rule');
    expect(n.rule?.kind).toBe('group');
    expect(n.rule?.children[0]?.kind).toBe('leaf');
  });

  test('editing the embedded rule commits {rule: Condition} back', () => {
    const n = build({ rule: { all: [] } }) as ActionLeafNode;
    n.rule?.addRule();
    expect(committed).toHaveProperty('rule');
    expect((committed as { rule: { all: unknown[] } }).rule.all).toHaveLength(1);
  });

  test('kind.set swaps the variant with a sensible default', () => {
    const n = build('manage') as ActionLeafNode;
    n.kind.set('self');
    expect(committed).toEqual({ self: '' });
  });

  test('deny (null) builds a kind-only node — no variant controls, no crash', () => {
    const n = build(null) as ActionLeafNode;
    expect(n.kind.value).toBe('deny');
    expect(n.delegate).toBeUndefined();
    expect(n.self).toBeUndefined();
    expect(n.rel).toBeUndefined();
    expect(n.rule).toBeUndefined();
  });

  test('a group with a null (deny) child builds without crashing', () => {
    const g = build({ any: ['manage', null] }) as ActionGroupNode;
    expect((g.children[1] as ActionLeafNode).kind.value).toBe('deny');
  });
});

describe('buildActionRoot — any/all groups', () => {
  test('a group exposes children + addChild', () => {
    const rule: ActionRule = { any: ['manage', { self: 'userId' }] };
    const g = build(rule) as ActionGroupNode;
    expect(g.kind.value).toBe('any');
    expect(g.children).toHaveLength(2);
    expect((g.children[0] as ActionLeafNode).kind.value).toBe('delegate');
    g.addChild?.();
    expect((committed as { any: ActionRule[] }).any).toHaveLength(3);
  });

  test('nested children carry the right path + a working remove', () => {
    const rule: ActionRule = { all: ['manage', 'read'] };
    const g = build(rule) as ActionGroupNode;
    g.children[1].remove?.();
    expect(committed).toEqual({ all: ['manage'] });
  });
});
