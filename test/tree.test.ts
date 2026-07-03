import { describe, expect, test } from 'bun:test';
import type { Condition } from '@inixiative/json-rules';
import {
  addRule,
  getNode,
  groupSiblings,
  removeNode,
  setNode,
  unwrapCompound,
  wrapInCompound,
} from '../src/core/tree';

const leaf = (field: string, value: unknown): Condition =>
  ({ field, operator: 'equals', value }) as Condition;

const tree = (): Condition => ({
  all: [leaf('a', 1), { any: [leaf('b', 2), leaf('c', 3)] }],
});

describe('getNode', () => {
  test('reads nested nodes by path', () => {
    expect(getNode(tree(), [0])).toEqual(leaf('a', 1));
    expect(getNode(tree(), [1, 'any', 0] as never)).toBeUndefined(); // 'any' is not a path segment
    expect(getNode(tree(), [1])).toEqual({ any: [leaf('b', 2), leaf('c', 3)] });
    expect(getNode(tree(), [1, 1])).toEqual(leaf('c', 3));
  });

  test('returns undefined for an out-of-range or invalid path', () => {
    expect(getNode(tree(), [5])).toBeUndefined();
    expect(getNode(leaf('a', 1), [0])).toBeUndefined();
  });
});

describe('setNode', () => {
  test('replaces a nested node immutably', () => {
    const original = tree();
    const next = setNode(original, [1, 0], leaf('b', 99));
    expect(getNode(next, [1, 0])).toEqual(leaf('b', 99));
    expect(getNode(original, [1, 0])).toEqual(leaf('b', 2)); // original untouched
  });

  test('empty path replaces the root', () => {
    expect(setNode(tree(), [], leaf('z', 0))).toEqual(leaf('z', 0));
  });

  test('steps into if/then/else and condition', () => {
    const ite: Condition = { if: leaf('x', 1), then: leaf('y', 2) } as Condition;
    const next = setNode(ite, ['then'], leaf('y', 3));
    expect(getNode(next, ['then'])).toEqual(leaf('y', 3));
  });
});

describe('addRule', () => {
  test('appends to an all/any compound', () => {
    const next = addRule(tree(), [], leaf('d', 4));
    expect((getNode(next, []) as { all: Condition[] }).all).toHaveLength(3);
    expect(getNode(next, [2])).toEqual(leaf('d', 4));
  });

  test('appends into a nested any', () => {
    const next = addRule(tree(), [1], leaf('d', 4));
    expect(getNode(next, [1, 2])).toEqual(leaf('d', 4));
  });

  test('throws when the parent is not a compound', () => {
    expect(() => addRule(tree(), [0], leaf('d', 4))).toThrow();
  });
});

describe('removeNode', () => {
  test('removes an element from a compound array', () => {
    const next = removeNode(tree(), [0]);
    expect((getNode(next, []) as { all: Condition[] }).all).toHaveLength(1);
    expect(getNode(next, [0])).toEqual({ any: [leaf('b', 2), leaf('c', 3)] });
  });

  test('removes an else branch', () => {
    const ite: Condition = {
      if: leaf('x', 1),
      then: leaf('y', 2),
      else: leaf('z', 3),
    } as Condition;
    const next = removeNode(ite, ['else']);
    expect('else' in (next as object)).toBe(false);
  });

  test('refuses to remove the root or a required segment', () => {
    expect(() => removeNode(tree(), [])).toThrow();
    const ite: Condition = { if: leaf('x', 1), then: leaf('y', 2) } as Condition;
    expect(() => removeNode(ite, ['then'])).toThrow();
  });
});

describe('wrap / unwrap', () => {
  test('wraps a leaf in a compound and unwraps it back', () => {
    const wrapped = wrapInCompound(tree(), [0], 'any');
    expect(getNode(wrapped, [0])).toEqual({ any: [leaf('a', 1)] });
    const unwrapped = unwrapCompound(wrapped, [0]);
    expect(getNode(unwrapped, [0])).toEqual(leaf('a', 1));
  });

  test('unwrap dissolves a multi-child compound into its all/any parent (move up a layer)', () => {
    // tree(): all[ leaf(a), any[leaf(b), leaf(c)] ] → dissolve the any at [1]
    const next = unwrapCompound(tree(), [1]) as { all: Condition[] };
    expect(next.all).toEqual([leaf('a', 1), leaf('b', 2), leaf('c', 3)]);
  });

  test('unwrap refuses to dissolve a multi-child root', () => {
    expect(() => unwrapCompound(tree(), [])).toThrow();
  });

  test('unwrapping an empty group deletes the wrapper entirely (nothing to promote)', () => {
    const t = { all: [leaf('a', 1), { any: [] }, leaf('b', 2)] } as Condition;
    const next = unwrapCompound(t, [1]) as { all: Condition[] };
    expect(next.all).toEqual([leaf('a', 1), leaf('b', 2)]); // empty group gone, contents (none) promoted
  });
});

describe('groupSiblings (move selected siblings down a layer)', () => {
  test('groups chosen indices into a new subgroup at the earliest position', () => {
    const t = { all: [leaf('a', 1), leaf('b', 2), leaf('c', 3)] } as Condition;
    const next = groupSiblings(t, [], [0, 2], 'any') as { all: Condition[] };
    // a and c grouped into an any at index 0; b remains after.
    expect(next.all).toEqual([{ any: [leaf('a', 1), leaf('c', 3)] }, leaf('b', 2)]);
  });

  test('round-trips with unwrap (group then dissolve restores order of the grouped subset)', () => {
    const t = { all: [leaf('a', 1), leaf('b', 2), leaf('c', 3)] } as Condition;
    const grouped = groupSiblings(t, [], [0, 1], 'any');
    const back = unwrapCompound(grouped, [0]) as { all: Condition[] };
    expect(back.all).toEqual([leaf('a', 1), leaf('b', 2), leaf('c', 3)]);
  });

  test('throws on out-of-range index or empty selection', () => {
    const t = { all: [leaf('a', 1)] } as Condition;
    expect(() => groupSiblings(t, [], [5], 'all')).toThrow();
    expect(() => groupSiblings(t, [], [], 'all')).toThrow();
  });
});
