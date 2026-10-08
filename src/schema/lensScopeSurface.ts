import type { Lens, LensNarrowing } from '@inixiative/json-rules';
import { useMemo } from 'react';
import { type LensValueOption, leafOption } from './lensValuePicker';
import { createView, relationTarget, type ViewAt, viewAt, viewRoot, visitOf } from './surface';

/** A to-many relation reached on the way to a scope's flat values — a loop portal.
 *  `path` is dotted from the scope's start (e.g. `account.opportunities`); a consumer
 *  renders it as a loop entry point (`{{#each path as=binding}}`) and gets the surface
 *  inside the loop by calling {@link lensScopeSurface} again with `{ at: loop.at }` —
 *  the loop's dotted path from the lens anchor, so the nested scope is the visit the
 *  lens shows there. */
export type LensLoopOption = {
  path: string;
  /** The loop's dotted relation path from the lens anchor. */
  at: string;
  field: string;
  label: string;
  relation: { mapName: string; modelName: string };
};

/** One scope: the values usable as single tokens here, and the loops that open a
 *  nested scope. Every leaf below a loop lives in that nested scope, never here. */
export type LensScope = {
  values: LensValueOption[];
  loops: LensLoopOption[];
};

export type LensScopeSurfaceOptions = {
  /** Where the scope starts: a dotted relation path from the lens anchor — a loop's `at`.
   *  The anchor by default. */
  at?: string;
  /** path → display label override, applied to values and loops alike. */
  labels?: Record<string, string>;
};

/**
 * Split what a lens shows at one scope into flat `values` and `loops`.
 *
 * The lens is the depth: the to-one relations it turns on are traversed — it ends every
 * path (each model-default edge once per path) — because every leaf below them is still a single value on the
 * scope's row. A to-many relation is not a value and is not traversed — it is emitted
 * in `loops`, and its own scope comes from calling this again with `{ at: loop.at }`.
 * Each visit reads what the lens shows on that path. A scalar list column stays a value
 * (`isList: true`). Pure.
 */
export const lensScopeSurface = (
  lensOrNarrowing: Lens | LensNarrowing,
  opts: LensScopeSurfaceOptions = {},
): LensScope => {
  const start = viewAt(viewRoot(createView(lensOrNarrowing)), opts.at ?? '');
  const values: LensValueOption[] = [];
  const loops: LensLoopOption[] = [];

  const walk = (scope: ViewAt, prefix: string): void => {
    const visit = visitOf(scope);
    if (!visit) return;

    for (const [name, entry] of Object.entries(visit.fields)) {
      const path = prefix ? `${prefix}.${name}` : name;
      const target = relationTarget(entry, visit.mapName);
      if (target) {
        const next = viewAt(scope, name);
        if (entry.isList === true) {
          loops.push({
            path,
            at: next.at.slice(next.at.indexOf('.') + 1),
            field: name,
            label: opts.labels?.[path] ?? name,
            relation: target,
          });
          continue;
        }
        walk(next, path);
        continue;
      }
      values.push(leafOption(name, entry, path, opts.labels));
    }
  };

  walk(start, '');
  return { values, loops };
};

/** Memoized hook form of {@link lensScopeSurface}. */
export const useLensScopeSurface = (
  lensOrNarrowing: Lens | LensNarrowing,
  opts: LensScopeSurfaceOptions = {},
): LensScope =>
  // biome-ignore lint/correctness/useExhaustiveDependencies: depend on option fields, not opts identity, so inline literals don't re-run the walk
  useMemo(() => lensScopeSurface(lensOrNarrowing, opts), [lensOrNarrowing, opts.at, opts.labels]);
