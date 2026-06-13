import { describe, expect, test } from 'bun:test';
import type { Condition } from '@inixiative/json-rules';
import { stripMeta, switchGroupOperator, trimEmptyGroups, withIds } from '../src/core/decorate';

const leaf = (field: string): Condition => ({ field, operator: 'equals', value: 1 }) as Condition;

describe('switchGroupOperator', () => {
  test('toggles all → any preserving children and id', () => {
    const node = { all: [leaf('a'), leaf('b')], _groupId: 'g1' } as unknown as Condition;
    const next = switchGroupOperator(node, 'any') as unknown as Record<string, unknown>;
    expect(next.any).toHaveLength(2);
    expect('all' in next).toBe(false);
    expect(next._groupId).toBe('g1');
  });

  test('throws on a non-compound', () => {
    expect(() => switchGroupOperator(leaf('a'), 'any')).toThrow();
  });
});

describe('trimEmptyGroups', () => {
  test('prunes empty leaf groups and collapses an all-empty tree to undefined', () => {
    const node = { all: [{ any: [] }, leaf('a'), { all: [] }] } as unknown as Condition;
    const trimmed = trimEmptyGroups(node) as unknown as Record<string, unknown>;
    expect((trimmed.all as unknown[]).length).toBe(1); // only leaf('a') survives
    expect(trimEmptyGroups({ all: [{ any: [] }] } as unknown as Condition)).toBeUndefined();
  });
});

describe('stripMeta', () => {
  test('removes _id/_groupId deeply, leaving a clean Condition', () => {
    const node = {
      all: [{ field: 'a', operator: 'equals', value: 1, _id: 'r1' }],
      _groupId: 'g1',
    } as unknown as Condition;
    const clean = stripMeta(node) as unknown as Record<string, unknown>;
    expect('_groupId' in clean).toBe(false);
    expect('_id' in (clean.all as Record<string, unknown>[])[0]).toBe(false);
    expect((clean.all as Record<string, unknown>[])[0]).toEqual({
      field: 'a',
      operator: 'equals',
      value: 1,
    });
  });
});

describe('editor boundary: decorate in, strip out → DB form stays clean', () => {
  test('stripMeta(withIds(clean)) deep-equals the original clean Condition', () => {
    const clean = {
      all: [
        { field: 'a', operator: 'equals', value: 1 },
        { any: [{ field: 'b', operator: 'equals', value: 2 }] },
      ],
    } as unknown as Condition;
    const decorated = withIds(clean, (() => {
      let n = 0;
      return () => `id${n++}`;
    })());
    // Decorated form carries ids (for React keys)...
    expect(JSON.stringify(decorated)).toContain('_groupId');
    // ...but the round-trip back out is byte-identical to what went in.
    expect(stripMeta(decorated)).toEqual(clean);
  });
});

describe('withIds', () => {
  test('assigns ids where missing and is idempotent', () => {
    let n = 0;
    const makeId = () => `id${n++}`;
    const node = { all: [leaf('a'), { any: [leaf('b')] }] } as unknown as Condition;
    const first = withIds(node, makeId);
    const firstJson = JSON.stringify(first);
    // Re-running with a fresh counter must NOT change existing ids.
    const second = withIds(first, () => `SHOULD_NOT_APPEAR`);
    expect(JSON.stringify(second)).toBe(firstJson);
    const rec = first as unknown as Record<string, unknown>;
    expect(rec._groupId).toBeDefined();
    expect((rec.all as Record<string, unknown>[])[0]._id).toBeDefined();
  });
});
