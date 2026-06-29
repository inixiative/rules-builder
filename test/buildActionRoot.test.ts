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
        organization: { kind: 'object', type: 'Organization' },
      },
    },
    Organization: { fields: { id: { kind: 'scalar', type: 'String' }, name: { kind: 'scalar', type: 'String' } } },
  },
  enums: { Role: ['owner', 'admin', 'member'] },
};

const lens = resolve({ maps: { app: map }, mapName: 'app', model: 'User' });
const fields = describeModelFields(lens, 'app', 'User');
const actionsByResource = { 'app:User': ['own', 'manage', 'read'], 'app:Organization': ['own', 'manage', 'read'] };

let committed: ActionRule | undefined;
const build = (rule: ActionRule) => {
  committed = undefined;
  return buildActionRoot(rule, {
    lens,
    fields,
    siblingActions: ['manage', 'read'],
    actionsByResource,
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

  test('rel offers relation fields, and the target model’s actions', () => {
    const n = build({ rel: 'organization', action: 'own' }) as ActionLeafNode;
    expect(n.kind.value).toBe('rel');
    expect(n.rel?.relation.options.map((o) => o.value)).toEqual(['organization']);
    expect(n.rel?.target).toBe('app:Organization');
    expect(n.rel?.action.options.map((o) => o.value)).toEqual(['own', 'manage', 'read']);
    expect(n.rel?.action.value).toBe('own');
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
