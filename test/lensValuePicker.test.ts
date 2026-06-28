import { describe, expect, test } from 'bun:test';
import { createLens, type FieldMap } from '@inixiative/json-rules';
import { lensValuePicker } from '../src/schema/lensValuePicker';

const map: FieldMap = {
  models: {
    User: {
      fields: {
        id: { kind: 'scalar', type: 'Int' },
        tier: { kind: 'scalar', type: 'String', values: ['gold', 'silver'] },
        role: { kind: 'enum', type: 'UserRole' },
        account: { kind: 'object', type: 'Account' },
      },
    },
    Account: {
      fields: {
        id: { kind: 'scalar', type: 'Int' },
        industry: { kind: 'scalar', type: 'String' },
      },
    },
  },
  enums: { UserRole: ['admin', 'member'] },
};

const lens = createLens({ maps: { app: map }, mapName: 'app', model: 'User' });

const byPath = (lensArg = lens, opts = {}) =>
  Object.fromEntries(lensValuePicker(lensArg, opts).map((o) => [o.path, o]));

describe('lensValuePicker', () => {
  test('depth 0 lists the anchor model leaf values, not relations', () => {
    const opts = byPath();
    expect(Object.keys(opts).sort()).toEqual(['id', 'role', 'tier']);
    expect(opts.account).toBeUndefined(); // relation is not a value
  });

  test('carries kind and the allowed value set', () => {
    const opts = byPath();
    expect(opts.tier).toMatchObject({ field: 'tier', kind: 'String', values: ['gold', 'silver'] });
    expect(opts.role).toMatchObject({ field: 'role', kind: 'Enum', values: ['admin', 'member'] });
  });

  test('reaches values across relations up to maxDepth as dotted paths', () => {
    const opts = byPath(lens, { maxDepth: 1 });
    expect(opts['account.industry']).toMatchObject({ field: 'industry', kind: 'String' });
    expect(opts['account.id']).toBeDefined();
    // still no relation entry itself
    expect(opts.account).toBeUndefined();
  });

  test('respects an explicit start model', () => {
    const opts = byPath(lens, { model: 'Account' });
    expect(Object.keys(opts).sort()).toEqual(['id', 'industry']);
  });
});
