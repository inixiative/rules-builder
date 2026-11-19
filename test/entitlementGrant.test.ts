import { describe, expect, test } from 'bun:test';
import type { FieldMap } from '@inixiative/field-map';
import { type Condition, type ModelNarrowing, Operator } from '@inixiative/json-rules';
import { buildEntitlementGrantRoot, type OperationTreeNode } from '../src/entitlements';
import { resolve, withAllRelations } from '../src/schema/surface';

const map: FieldMap = {
  models: {
    Repo: {
      fields: {
        name: { kind: 'scalar', type: 'String' },
        archived: { kind: 'scalar', type: 'Boolean' },
      },
    },
  },
};
const view = resolve(withAllRelations({ maps: { app: map }, mapName: 'app', model: 'Repo' }));

const tree: OperationTreeNode[] = [
  {
    key: 'repo',
    segment: 'repo',
    leaf: false,
    children: [
      { key: 'repo.read', segment: 'read', leaf: true, children: [] },
      { key: 'repo.write', segment: 'write', leaf: true, children: [] },
    ],
  },
];

describe('buildEntitlementGrantRoot', () => {
  test('operations follow the caller: offered, chosen, partly, and toggled through it', () => {
    const toggled: string[] = [];
    const root = buildEntitlementGrantRoot({
      operations: {
        tree,
        offered: (key) => key !== 'repo.write',
        chosen: (key) => key === 'repo.read',
        toggle: (key) => toggled.push(key),
      },
    });
    const [repo] = root.operations!;
    expect(repo.chosen).toBe(false);
    expect(repo.partly).toBe(true);
    const [read, write] = repo.children;
    expect(read.chosen).toBe(true);
    expect(write.offered).toBe(false);
    expect(write.toggle).toBeUndefined();
    read.toggle!();
    expect(toggled).toEqual(['repo.read']);
  });

  test('a parent whose children are all chosen is chosen', () => {
    const root = buildEntitlementGrantRoot({
      operations: { tree, offered: () => true, chosen: (key) => key !== 'repo', toggle: () => {} },
    });
    expect(root.operations![0].chosen).toBe(true);
    expect(root.operations![0].partly).toBe(false);
  });

  test('the added where is a positive builder; the held conditions are shown as they are', () => {
    const held: Condition[] = [{ field: 'archived', operator: Operator.equals, value: false }];
    let committed: Condition | undefined;
    const root = buildEntitlementGrantRoot({
      where: { view, held, commit: (next) => (committed = next) },
    });
    expect(root.where!.held).toBe(held);
    expect(root.where!.added.kind).toBe('group');
    const added = root.where!.added;
    if (added.kind !== 'group') throw new Error('expected a group');
    added.addRule();
    expect(committed).toBeDefined();
  });

  test('the added where offers no operator that holds on a missing value', () => {
    const root = buildEntitlementGrantRoot({
      where: {
        view,
        held: [],
        value: { all: [{ field: 'name', operator: Operator.equals, value: 'core' }] },
        commit: () => {},
      },
    });
    const added = root.where!.added;
    const leaf = added.kind === 'group' ? added.children[0] : undefined;
    const ops = leaf?.kind === 'leaf' ? leaf.operator.options.map((o) => o.value) : [];
    expect(ops).toContain(Operator.equals);
    expect(ops).not.toContain(Operator.notEquals);
    expect(ops).not.toContain(Operator.isEmpty);
  });

  test('the narrowing is validated by the caller', () => {
    const narrowing: ModelNarrowing = { picks: ['name'] };
    const seen: ModelNarrowing[] = [];
    const root = buildEntitlementGrantRoot({
      lens: {
        value: narrowing,
        validate: (n) => {
          seen.push(n);
          return { ok: false, errors: ['too wide'] };
        },
        commit: () => {},
      },
    });
    expect(seen).toEqual([narrowing]);
    expect(root.lens!.validation).toEqual({ ok: false, errors: ['too wide'] });
  });

  test('a part left out is absent', () => {
    expect(buildEntitlementGrantRoot({})).toEqual({
      operations: undefined,
      where: undefined,
      lens: undefined,
    });
  });
});
