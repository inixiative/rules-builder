import { afterEach, describe, expect, test } from 'bun:test';
import { createLens, type FieldMap } from '@inixiative/json-rules';
import { cleanup, renderHook } from '@testing-library/react';
import { type LensScopeSurfaceOptions, useLensScopeSurface } from '../src/schema/lensScopeSurface';

afterEach(cleanup);

const map: FieldMap = {
  models: {
    Recipient: {
      fields: {
        email: { kind: 'scalar', type: 'String' },
        account: { kind: 'object', type: 'Account' },
        fanMissions: { kind: 'object', type: 'FanMission', isList: true },
      },
    },
    Account: { fields: { industry: { kind: 'scalar', type: 'String' } } },
    FanMission: { fields: { status: { kind: 'scalar', type: 'String' } } },
  },
};
const lens = createLens({ maps: { app: map }, mapName: 'app', model: 'Recipient' });

describe('useLensScopeSurface', () => {
  test('splits the anchor scope into to-one values and to-many loop portals', () => {
    const { result } = renderHook(() => useLensScopeSurface(lens, {}));
    expect(result.current.values.map((v) => v.path).sort()).toEqual(['account.industry', 'email']);
    expect(result.current.loops.map((l) => l.path)).toEqual(['fanMissions']);
  });

  test('memoizes on its input fields — stable ref for equal inputs, fresh ref when the anchor changes', () => {
    const { result, rerender } = renderHook(
      (opts: LensScopeSurfaceOptions) => useLensScopeSurface(lens, opts),
      { initialProps: {} as LensScopeSurfaceOptions },
    );
    const first = result.current;
    // a brand-new opts object with the SAME field values must not recompute (deps key on fields)
    rerender({});
    expect(result.current).toBe(first);
    // re-anchoring at the loop's element model invalidates and yields that scope
    rerender({ model: 'FanMission' });
    expect(result.current).not.toBe(first);
    expect(result.current.values.map((v) => v.path)).toEqual(['status']);
  });
});
