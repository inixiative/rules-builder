import { describe, expect, test } from 'bun:test';
import type { Condition, FieldMap } from '@inixiative/json-rules';
import { buildRoot, type LeafNode } from '../src/builder/buildNodes';
import { describeModelFields, resolve } from '../src/schema/surface';

const map: FieldMap = {
  models: {
    User: {
      fields: {
        role: { kind: 'enum', type: 'UserRole' },
        tier: { kind: 'scalar', type: 'String' },
      },
    },
  },
  enums: { UserRole: ['admin', 'member'] },
};

const lens = resolve({ maps: { app: map }, mapName: 'app', model: 'User' });
const build = (c: Condition, fields = describeModelFields(lens, 'app', 'User')) =>
  buildRoot(c, lens, fields, 4, () => {});

const leafOf = (c: Condition, fields?: ReturnType<typeof describeModelFields>) =>
  build(c, fields).children[0] as LeafNode;

describe('enum-option labels', () => {
  test('describeModelFields carries value labels onto the field', () => {
    const fields = describeModelFields(lens, 'app', 'User', {
      valueLabels: { role: { admin: 'Administrator', member: 'Member' } },
    });
    expect(fields.find((f) => f.name === 'role')?.enumLabels).toEqual({
      admin: 'Administrator',
      member: 'Member',
    });
  });

  test('the leaf value control renders labelled options (falling back to the raw value)', () => {
    const fields = describeModelFields(lens, 'app', 'User', {
      valueLabels: { 'User.role': { admin: 'Administrator' } },
    });
    const leaf = leafOf({ all: [{ field: 'role', operator: 'equals', value: 'admin' }] }, fields);
    expect(leaf.value.options).toEqual([
      { value: 'admin', label: 'Administrator' },
      { value: 'member', label: 'member' }, // unlabelled → raw value
    ]);
  });
});

describe('per-control validity', () => {
  test('field.valid is false when the field does not resolve in the surface', () => {
    const leaf = leafOf({
      all: [{ field: 'nope', operator: 'equals', value: 'x' }],
    });
    expect(leaf.field.valid).toBe(false);
    expect(leaf.valid).toBe(false);
  });

  test('value.valid is false when the value is outside the allowed enum set', () => {
    const bad = leafOf({
      all: [{ field: 'role', operator: 'equals', value: 'ceo' }],
    });
    expect(bad.field.valid).toBe(true); // the field is fine
    expect(bad.value.valid).toBe(false); // the value is not
    const ok = leafOf({
      all: [{ field: 'role', operator: 'equals', value: 'admin' }],
    });
    expect(ok.value.valid).toBe(true);
  });

  test('an unconstrained scalar value is always control-valid', () => {
    const leaf = leafOf({
      all: [{ field: 'tier', operator: 'equals', value: 'anything' }],
    });
    expect(leaf.field.valid).toBe(true);
    expect(leaf.value.valid).toBe(true);
  });
});
