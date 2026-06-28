import { beforeEach, describe, expect, test } from 'bun:test';
import type { Condition, FieldMap } from '@inixiative/json-rules';
import { buildRoot, type GroupNode, type LeafNode } from '../src/builder/buildNodes';
import { describeModelFields, resolve } from '../src/schema/surface';

const map: FieldMap = {
  models: {
    User: {
      fields: {
        tier: { kind: 'scalar', type: 'String', values: ['gold', 'silver'] },
        age: { kind: 'scalar', type: 'Int' },
      },
    },
  },
};

const lens = resolve({ maps: { app: map }, mapName: 'app', model: 'User' });
const fields = describeModelFields(lens, 'app', 'User');

const cond = (): Condition => ({
  all: [{ field: 'tier', operator: 'equals', value: 'gold', _id: 'a' }],
});

let committed: Condition | undefined;
const build = (c: Condition) => {
  committed = undefined;
  return buildRoot(c, lens, fields, 4, (next) => {
    committed = next;
  });
};

describe('buildRoot — descriptor tree', () => {
  beforeEach(() => {
    committed = undefined;
  });

  test('root is a group with the operator and one leaf child', () => {
    const root = build(cond());
    expect(root.kind).toBe('group');
    expect(root.operator.value).toBe('all');
    expect(root.children).toHaveLength(1);
    expect(root.children[0].kind).toBe('leaf');
  });

  test('leaf exposes field / operator / value controls with options', () => {
    const leaf = build(cond()).children[0] as LeafNode;
    expect(leaf.field.value).toBe('tier');
    expect(leaf.field.options.map((o) => o.value).sort()).toEqual(['age', 'tier']);
    expect(leaf.operator.value).toBe('equals');
    expect(leaf.operator.options.map((o) => o.value)).toContain('in');
    expect(leaf.value.current).toBe('gold');
    expect(leaf.value.shape).toBe('scalar');
    expect(leaf.value.options).toEqual([
      { value: 'gold', label: 'gold' },
      { value: 'silver', label: 'silver' },
    ]);
  });

  test('valid reflects the sourced/enum gate', () => {
    expect((build(cond()).children[0] as LeafNode).valid).toBe(true);
    const bad: Condition = { all: [{ field: 'tier', operator: 'equals', value: 'platinum', _id: 'a' }] };
    expect((build(bad).children[0] as LeafNode).valid).toBe(false);
  });

  test('value.set commits an updated tree', () => {
    const leaf = build(cond()).children[0] as LeafNode;
    leaf.value.set('silver');
    expect(committed).toEqual({ all: [{ field: 'tier', operator: 'equals', value: 'silver', _id: 'a' }] });
  });

  test('field.set rebuilds the leaf for the new field', () => {
    const leaf = build(cond()).children[0] as LeafNode;
    leaf.field.set('age');
    const child = (committed as { all: Condition[] }).all[0] as Record<string, unknown>;
    expect(child.field).toBe('age');
    expect(child._id).toBe('a'); // keeps identity
  });

  test('remove commits the leaf removed', () => {
    const leaf = build(cond()).children[0] as LeafNode;
    leaf.remove();
    expect(committed).toEqual({ all: [] });
  });

  test('group operator.set switches all/any', () => {
    build(cond()).operator.set('any');
    expect(committed).toHaveProperty('any');
  });

  test('addRule appends a child; addGroup appends an empty group; canAddGroup respects depth', () => {
    const root = build(cond());
    expect(root.canAddGroup).toBe(true);
    root.addRule();
    expect((committed as { all: Condition[] }).all).toHaveLength(2);

    const root2 = build(cond());
    root2.addGroup();
    const added = (committed as { all: Condition[] }).all.at(-1);
    expect(added).toEqual({ all: [] });
  });

  test('a non-group root is normalized into a group', () => {
    const leafRoot: Condition = { field: 'tier', operator: 'equals', value: 'gold' };
    const root: GroupNode = build(leafRoot);
    expect(root.kind).toBe('group');
    expect(root.children).toHaveLength(1);
  });
});
