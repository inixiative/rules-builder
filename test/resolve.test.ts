import { describe, expect, test } from 'bun:test';
import { checkRuleAgainstLens, type Condition, type FieldMap } from '@inixiative/json-rules';
import { describeModelFields, resolve } from '../src/schema/surface';

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

describe('resolve — serializable source → public surface', () => {
  test('builds an exposed-surface lens from maps + entrypoint', () => {
    const lens = resolve({ maps: { app: map }, mapName: 'app', model: 'User' });
    const names = describeModelFields(lens, 'app', 'User').map((f) => f.name).sort();
    expect(names).toEqual(['email', 'password', 'role', 'tier']);
  });

  test('applies a parent-less narrowing and does not leak the omitted field', () => {
    const lens = resolve({
      maps: { app: map },
      mapName: 'app',
      model: 'User',
      narrowing: { mapDefaults: { app: { models: { User: { omits: ['password'] } } } } },
    });
    const names = describeModelFields(lens, 'app', 'User').map((f) => f.name).sort();
    expect(names).toEqual(['email', 'role', 'tier']);
  });
});

describe('resolve — fetched sourceValues fold onto the surface', () => {
  const source = { maps: { app: map }, mapName: 'app', model: 'User' };
  const sourceValues = [
    { path: 'User', mapName: 'app', model: 'User', field: 'tier', values: ['gold', 'silver'] },
  ];

  test('fetched values surface as enumValues, kind preserved', () => {
    const lens = resolve(source, { sourceValues });
    const tier = describeModelFields(lens, 'app', 'User').find((f) => f.name === 'tier');
    expect(tier?.enumValues).toEqual(['gold', 'silver']);
    expect(tier?.kind).toBe('String'); // keeps native operators
  });

  test('checkRuleAgainstLens gates rule values against the folded set', () => {
    const lens = resolve(source, { sourceValues });
    const good: Condition = { all: [{ field: 'tier', operator: 'equals', value: 'gold' }] };
    const bad: Condition = { all: [{ field: 'tier', operator: 'equals', value: 'platinum' }] };
    expect(checkRuleAgainstLens(good, lens).ok).toBe(true);
    expect(checkRuleAgainstLens(bad, lens).ok).toBe(false);
  });
});
