import { describe, expect, test } from 'bun:test';
import type { FieldMap } from '@inixiative/json-rules';
import { composeSurface, describeModelFields } from '../src/schema/surface';

const map: FieldMap = {
  models: {
    User: {
      fields: {
        email: { kind: 'scalar', type: 'String' },
        password: { kind: 'scalar', type: 'String' },
        role: { kind: 'enum', type: 'UserRole' },
      },
    },
  },
  enums: { UserRole: ['admin', 'member', 'guest'] },
};

describe('composeSurface — accepts serializable maps', () => {
  test('builds an exposed-surface lens from maps + entrypoint', () => {
    const lens = composeSurface({ maps: { app: map }, mapName: 'app', model: 'User' });
    const names = describeModelFields(lens, 'app', 'User').map((f) => f.name).sort();
    expect(names).toEqual(['email', 'password', 'role']);
  });

  test('applies a parent-less narrowing and does not leak the omitted field', () => {
    const lens = composeSurface({
      maps: { app: map },
      mapName: 'app',
      model: 'User',
      narrowing: { mapDefaults: { app: { models: { User: { omits: ['password'] } } } } },
    });
    const names = describeModelFields(lens, 'app', 'User').map((f) => f.name).sort();
    expect(names).toEqual(['email', 'role']); // password omitted, not exposed
  });
});
