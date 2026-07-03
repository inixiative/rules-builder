import { describe, expect, test } from 'bun:test';
import type { SourceValues } from '@inixiative/json-rules';
import { parseSavedRule, type SavedRule, stringifySavedRule } from '../src';

type Ref = { kind: 'lens' | 'narrowing'; name: string };

const sourceValues: SourceValues[] = [
  {
    path: 'User',
    mapName: 'app',
    model: 'User',
    field: 'tier',
    values: ['gold', 'silver'],
  },
];

const saved: SavedRule<Ref> = {
  source: { kind: 'narrowing', name: 'vip-active' },
  rule: { all: [{ field: 'tier', operator: 'equals', value: 'gold' }] },
  sourceValues,
};

describe('SavedRule serialization', () => {
  test('stringify → parse round-trips losslessly', () => {
    expect(parseSavedRule<Ref>(stringifySavedRule(saved))).toEqual(saved);
  });

  test('stringify pretty-prints by default', () => {
    expect(stringifySavedRule(saved)).toContain('\n');
  });

  test('keeps the source binding by reference (not an inlined surface)', () => {
    const back = parseSavedRule<Ref>(stringifySavedRule(saved));
    expect(back.source).toEqual({ kind: 'narrowing', name: 'vip-active' });
    expect(back.sourceValues).toEqual(sourceValues);
  });

  test('parse throws on malformed JSON', () => {
    expect(() => parseSavedRule('{not json')).toThrow();
  });

  test('parse throws when the root is not an object', () => {
    expect(() => parseSavedRule('42')).toThrow();
    expect(() => parseSavedRule('[]')).toThrow();
  });

  test('parse throws when rule or source is missing', () => {
    expect(() => parseSavedRule(JSON.stringify({ source: { kind: 'lens', name: 'x' } }))).toThrow(
      /rule/,
    );
    expect(() => parseSavedRule(JSON.stringify({ rule: { all: [] } }))).toThrow(/source/);
  });

  test('parse throws when sourceValues is present but not an array', () => {
    expect(() =>
      parseSavedRule(
        JSON.stringify({
          source: { kind: 'lens', name: 'x' },
          rule: { all: [] },
          sourceValues: 'nope',
        }),
      ),
    ).toThrow(/sourceValues/);
  });
});
