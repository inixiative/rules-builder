import { afterEach, describe, expect, test } from 'bun:test';
import { createLens, type FieldMap } from '@inixiative/json-rules';
import { cleanup, renderHook } from '@testing-library/react';
import { type LensValuePickerOptions, useLensValuePicker } from '../src/schema/lensValuePicker';

afterEach(cleanup);

const map: FieldMap = {
  models: {
    User: {
      fields: {
        tier: { kind: 'scalar', type: 'String', values: ['gold', 'silver'] },
        role: { kind: 'enum', type: 'UserRole' },
        account: { kind: 'object', type: 'Account' },
      },
    },
    Account: { fields: { industry: { kind: 'scalar', type: 'String' } } },
  },
  enums: { UserRole: ['admin', 'member'] },
};
const lens = createLens({ maps: { app: map }, mapName: 'app', model: 'User' });

const byPath = (out: ReturnType<typeof useLensValuePicker>) =>
  Object.fromEntries(out.map((o) => [o.path, o]));

describe('useLensValuePicker', () => {
  test('depth 0 enumerates leaf scalars/enums as dotted paths with kind + value set; relations excluded', () => {
    const { result } = renderHook(() => useLensValuePicker(lens, {}));
    const opts = byPath(result.current);
    expect(Object.keys(opts).sort()).toEqual(['role', 'tier']);
    expect(opts.tier).toMatchObject({ path: 'tier', kind: 'String', values: ['gold', 'silver'] });
    expect(opts.role).toMatchObject({ path: 'role', kind: 'Enum', values: ['admin', 'member'] });
    expect(opts.account).toBeUndefined(); // a relation is traversed, never emitted
  });

  test('reaches relation-traversed paths as dotted paths at maxDepth', () => {
    const { result } = renderHook(() => useLensValuePicker(lens, { maxDepth: 1 }));
    const opts = byPath(result.current);
    expect(opts['account.industry']).toMatchObject({ field: 'industry', kind: 'String' });
    expect(opts.account).toBeUndefined();
  });

  test('memoizes on its input fields — stable ref for equal inputs, fresh ref when maxDepth changes', () => {
    const { result, rerender } = renderHook(
      (opts: LensValuePickerOptions) => useLensValuePicker(lens, opts),
      {
        initialProps: { maxDepth: 1 } as LensValuePickerOptions,
      },
    );
    const first = result.current;
    // a brand-new opts object with the SAME field values must not recompute (deps key on fields)
    rerender({ maxDepth: 1 });
    expect(result.current).toBe(first);
    // changing maxDepth invalidates and now reaches the relation path
    rerender({ maxDepth: 2 });
    expect(result.current).not.toBe(first);
    expect(result.current.some((o) => o.path === 'account.industry')).toBe(true);
  });
});
