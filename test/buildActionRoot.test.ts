import { describe, expect, test } from 'bun:test';
import {
  type ActionGroupNode,
  type ActionLeafNode,
  buildActionRoot,
} from '../src/permissions/buildActionRoot';
import type { ActionRule } from '../src/permissions/types';
import { describeScopeFields, viewRoot } from '../src/schema/surface';
import { permissionsMap } from './fixtures/permissionsMap';

let committed: ActionRule | undefined;
const build = (rule: ActionRule, resource = 'app:User') => {
  committed = undefined;
  return buildActionRoot(rule, {
    map: permissionsMap,
    resource,
    action: 'own',
    maxDepth: 4,
    commit: (next) => {
      committed = next;
    },
  });
};

describe('buildActionRoot — model-aware leaves', () => {
  test("delegate offers the resource's other actions, never its own", () => {
    const n = build('manage') as ActionLeafNode;
    expect(n.kind.value).toBe('delegate');
    expect(n.delegate?.value).toBe('manage');
    expect(n.delegate?.options.map((o) => o.value)).toEqual(['manage', 'read']);
  });

  test('a list arm offers only declared `down` lists, and builds its condition on the item', () => {
    const n = build({
      rel: 'drafts',
      arrayOperator: 'any',
      condition: { rule: { field: 'title', operator: 'equals', value: 'x' } },
    }) as ActionLeafNode;
    expect(n.kind.value).toBe('list');
    expect(n.list?.relation.options.map((o) => o.value)).toEqual(['drafts']); // not `posts`
    expect(n.list?.target).toBe('app:Post');
    expect(n.issues).toEqual([]);
    const condition = n.list?.condition as ActionLeafNode;
    expect(condition.kind.value).toBe('rule');
    expect(condition.rule).toBeDefined();
    condition.kind.set('delegate');
    expect(committed).toEqual({ rel: 'drafts', arrayOperator: 'any', condition: '' });
  });

  test('editing a list arm keeps its condition; picking another list starts it over', () => {
    const rule: ActionRule = { rel: 'drafts', arrayOperator: 'any', condition: 'read' };
    const n = build(rule) as ActionLeafNode;
    const condition = n.list?.condition as ActionLeafNode;
    expect(condition.delegate?.options.map((o) => o.value)).toEqual(['read', 'edit']);
    condition.delegate?.set('edit');
    expect(committed).toEqual({ rel: 'drafts', arrayOperator: 'any', condition: 'edit' });
    n.list?.relation.set('drafts');
    expect(committed).toEqual({
      rel: 'drafts',
      arrayOperator: 'any',
      condition: { rule: { all: [] } },
    });
  });

  test('a rule leaf reads the supplied maps (`actor:User.id`) from its own row only', () => {
    const n = build({ rule: { all: [] } }) as ActionLeafNode;
    expect(n.rule?.kind).toBe('group');
    const ok = build({
      rule: { field: 'actor:Acting.model', operator: 'equals', value: 'User' },
    }) as ActionLeafNode;
    expect(ok.issues).toEqual([]);
    const related = build({
      rule: { field: 'organization.actor:Acting.model', operator: 'equals', value: 'User' },
    }) as ActionLeafNode;
    expect(related.issues.length).toBeGreaterThan(0);
  });

  test("a rule leaf carries what permissions' gate refuses, on the leaf that holds it", () => {
    const match = { rule: { field: 'ownerId', operator: 'equals', path: 'actor:User.id' } };
    const codes = (n: ActionLeafNode) => n.issues.map((issue) => issue.code);

    expect(codes(build(match, 'app:Post') as ActionLeafNode)).toEqual(['matchWithoutExists']);
    expect(
      codes(
        build(
          {
            rule: {
              all: [
                { field: 'ownerId', operator: 'exists' },
                { field: 'ownerId', operator: 'equals', path: 'actor:User.id' },
              ],
            },
          },
          'app:Post',
        ) as ActionLeafNode,
      ),
    ).toEqual([]);
    expect(
      codes(
        build(
          { rule: { field: 'title', operator: 'notEquals', value: 'x' } },
          'app:Post',
        ) as ActionLeafNode,
      ),
    ).toEqual(['notPositive']);
    expect(
      codes(
        build(
          { rule: { field: 'title', operator: 'equals', value: null } },
          'app:Post',
        ) as ActionLeafNode,
      ),
    ).toEqual(['nullCheckWithoutRowKey']);

    const group = build({ any: ['read', match] }, 'app:Post') as ActionGroupNode;
    expect(group.issues).toEqual([]);
    expect(codes(group.children[0] as ActionLeafNode)).toEqual([]);
    expect(codes(group.children[1] as ActionLeafNode)).toEqual(['matchWithoutExists']);

    const arm = build({ rel: 'drafts', arrayOperator: 'any', condition: match }) as ActionLeafNode;
    expect(arm.issues).toEqual([]);
    expect(codes(arm.list?.condition as ActionLeafNode)).toEqual(['matchWithoutExists']);
  });

  test("a null check beside an exists on its row's key is valid, as permissions accepts it", () => {
    const beside = build({
      rule: {
        all: [
          { field: 'id', operator: 'exists' },
          { field: 'role', operator: 'equals', value: null },
        ],
      },
    }) as ActionLeafNode;
    expect(beside.issues).toEqual([]);
    const children = (beside.rule as { children: { valid: boolean }[] }).children;
    expect(children.map((child) => child.valid)).toEqual([true, true]);

    const bare = build({
      rule: { field: 'role', operator: 'equals', value: null },
    }) as ActionLeafNode;
    expect(bare.issues.map((issue) => issue.code)).toEqual(['nullCheckWithoutRowKey']);
    expect((bare.rule as { valid: boolean }).valid).toBe(false);
  });

  test('a leaf is valid where json-rules accepts the whole rule, and only the leaf at fault is not', () => {
    const validity = (rule: unknown, resource = 'app:User') =>
      (
        (build({ rule } as never, resource) as ActionLeafNode).rule as {
          children: { valid?: boolean; children?: { valid: boolean }[] }[];
        }
      ).children.map((child) => child.children?.map((inner) => inner.valid) ?? child.valid);

    // A match beside the `exists` on its field.
    expect(
      validity({
        all: [
          { field: 'organizationId', operator: 'exists' },
          { field: 'organizationId', operator: 'equals', path: 'actor:User.id' },
        ],
      }),
    ).toEqual([true, true]);
    // The key check conjoined from inside a sibling group.
    expect(
      validity({
        all: [
          { all: [{ field: 'id', operator: 'exists' }] },
          { field: 'role', operator: 'equals', value: null },
        ],
      }),
    ).toEqual([[true], true]);
    // The two in one `any` are not conjoined.
    expect(
      validity({
        any: [
          { field: 'id', operator: 'exists' },
          { field: 'role', operator: 'equals', value: null },
        ],
      }),
    ).toEqual([true, false]);
    // A fault in the key check is its own, not the null check's.
    expect(
      validity({
        all: [
          { field: 'id', operator: 'exists', value: 1 },
          { field: 'role', operator: 'equals', value: null },
        ],
      }),
    ).toEqual([false, true]);
  });

  test("across nestings, every leaf is valid exactly when permissions' gate accepts the rule", () => {
    const key = { field: 'id', operator: 'exists' };
    const nul = { field: 'role', operator: 'equals', value: null };
    const has = { field: 'organizationId', operator: 'exists' };
    const match = { field: 'organizationId', operator: 'equals', path: 'actor:User.id' };
    const plain = { field: 'role', operator: 'equals', value: 'admin' };
    const leaves = [key, nul, has, match, plain];
    const pairs = leaves.flatMap((a) => leaves.map((b) => [a, b]));
    const rules: unknown[] = pairs.flatMap(([a, b]) => [
      { all: [a, b] },
      { any: [a, b] },
      { all: [a, { all: [b] }] },
      { all: [a, { any: [b, plain] }] },
      { any: [a, { all: [b, key] }] },
      { all: [{ all: [a] }, { all: [b] }] },
    ]);
    const leafValidity = (node: { valid?: boolean; children?: unknown[] }): boolean[] =>
      node.children
        ? node.children.flatMap((child) => leafValidity(child as never))
        : [node.valid === true];
    expect(rules).toHaveLength(150);
    for (const rule of rules) {
      const built = build({ rule } as never) as ActionLeafNode;
      expect([rule, leafValidity(built.rule as never).every(Boolean)]).toEqual([
        rule,
        built.issues.length === 0,
      ]);
    }
  });

  test('an issue below a node that no child carries shows on that node', () => {
    const arm = build({
      rel: 'drafts',
      arrayOperator: 'all',
      condition: 'read',
    } as never) as ActionLeafNode;
    expect(arm.issues.map((issue) => issue.path)).toEqual(['$.arrayOperator']);
    expect((arm.list?.condition as ActionLeafNode).issues).toEqual([]);
  });

  test('a list arm saved with no condition builds, with the gate saying what is missing', () => {
    const arm = build({ rel: 'drafts', arrayOperator: 'any' } as never) as ActionLeafNode;
    expect(arm.kind.value).toBe('list');
    expect(arm.list?.condition).toBeUndefined();
    expect(arm.issues.length).toBeGreaterThan(0);
  });

  test('a rule leaf offers positive operators only, as permissions judges it', () => {
    const n = build(
      { rule: { field: 'title', operator: 'equals', value: 'x' } },
      'app:Post',
    ) as ActionLeafNode;
    const offered = (n.rule as { operator: { options: { value: string }[] } }).operator.options.map(
      (o) => o.value,
    );
    expect(offered).toContain('equals');
    expect(offered).not.toContain('notEquals');
  });

  test("a rule reading back to a model it passed shows permissions' issue", () => {
    const n = build({
      rule: { field: 'organization.users.role', operator: 'equals', value: 'admin' },
    }) as ActionLeafNode;
    expect(n.issues.length).toBeGreaterThan(0);
  });

  test("a list arm item offers only what the list's `down` paths load", () => {
    const n = build({
      rel: 'drafts',
      arrayOperator: 'any',
      condition: { rule: { all: [] } },
    }) as ActionLeafNode;
    const item = n.list?.condition as ActionLeafNode;
    expect(item.kind.value).toBe('rule');
  });

  test('rel single hop offers only to-one relations (excludes the "many" side) + the target’s actions', () => {
    const n = build({ rel: 'organization', action: 'own' }) as ActionLeafNode;
    expect(n.kind.value).toBe('rel');
    expect(n.rel?.segments.map((s) => s.value)).toEqual(['organization']);
    // `posts` (a list / "many" side) is excluded — only to-one relations are walkable
    expect(n.rel?.segments[0].options.map((o) => o.value)).toEqual(['organization']);
    expect(n.rel?.target).toBe('app:Organization');
    expect(n.rel?.action.options.map((o) => o.value)).toEqual(['own', 'manage', 'read']);
    expect(n.rel?.addOptions.map((o) => o.value)).toEqual(['region']); // never back to a model passed
    expect(n.rel?.action.value).toBe('own');
  });

  test('rel multi-hop scopes each segment to the resource reached', () => {
    const n = build({ rel: 'organization.region', action: 'read' }) as ActionLeafNode;
    expect(n.rel?.segments.map((s) => s.value)).toEqual(['organization', 'region']);
    expect(n.rel?.segments[0].options.map((o) => o.value)).toEqual(['organization']); // User's to-one
    expect(n.rel?.segments[1].options.map((o) => o.value)).toEqual(['region']); // not back to Organization
    expect(n.rel?.target).toBe('app:Region');
    expect(n.rel?.action.options.map((o) => o.value)).toEqual(['read']);
  });

  test('a one-hop self relation is offered from the row', () => {
    const n = build({ rel: 'parent', action: 'own' }, 'app:Organization') as ActionLeafNode;
    expect(n.rel?.segments[0].options.map((o) => o.value)).toContain('parent');
    expect(n.rel?.target).toBe('app:Organization');
  });

  test('changing the relation path resets the action — a stale action would belong to the old target', () => {
    // organization → Organization; picking action 'manage' is valid there.
    const n = build({ rel: 'organization', action: 'manage' }) as ActionLeafNode;
    // appending a hop changes the target's actions; the prior pick must not survive stale.
    n.rel?.addSegment('region');
    expect(committed).toEqual({ rel: 'organization.region', action: '' });
  });

  test('editing a segment resets the action', () => {
    const n = build({ rel: 'organization.region', action: 'read' }) as ActionLeafNode;
    n.rel?.segments[0].set('organization');
    expect(committed).toEqual({ rel: 'organization', action: '' });
  });

  test('removing the last hop resets the action', () => {
    const n = build({ rel: 'organization.region', action: 'read' }) as ActionLeafNode;
    n.rel?.removeLast?.();
    expect(committed).toEqual({ rel: 'organization', action: '' });
  });

  test('picking the action keeps the relation path', () => {
    const n = build({ rel: 'organization', action: '' }) as ActionLeafNode;
    n.rel?.action.set('manage');
    expect(committed).toEqual({ rel: 'organization', action: 'manage' });
  });

  test('rule embeds a condition builder (a group node)', () => {
    const n = build({
      rule: { all: [{ field: 'role', operator: 'equals', value: 'admin' }] },
    }) as ActionLeafNode;
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
    n.kind.set('list');
    expect(committed).toEqual({ rel: '', arrayOperator: 'any', condition: { rule: { all: [] } } });
  });

  test('deny (null) builds a kind-only node — no variant controls, no crash', () => {
    const n = build(null) as ActionLeafNode;
    expect(n.kind.value).toBe('deny');
    expect(n.delegate).toBeUndefined();
    expect(n.list).toBeUndefined();
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
    const rule: ActionRule = { any: ['manage', { rel: 'organization', action: 'own' }] };
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
