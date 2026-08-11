import { exposedSurface, type Lens, type LensNarrowing } from '@inixiative/json-rules';
import { useMemo } from 'react';
import { type LensValueOption, leafOption } from './lensValuePicker';
import { relationTarget } from './surface';

/** A to-many relation reached on the way to a scope's flat values — a loop portal.
 *  `path` is dotted from the anchor model (e.g. `account.opportunities`); a consumer
 *  renders it as a loop entry point (`{{#each path as=binding}}`) and gets the surface
 *  inside the loop by calling {@link lensScopeSurface} again anchored at `relation`. */
export type LensLoopOption = {
  path: string;
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
  mapName?: string;
  model?: string;
  /** path → display label override, applied to values and loops alike. */
  labels?: Record<string, string>;
};

const RELATION_KINDS = new Set(['object', 'bridge']);

/**
 * Split what a lens exposes at one anchor into flat `values` and `loops`.
 *
 * The lens is the depth: to-one relations are traversed unbounded (cut per path when
 * a model repeats), because every leaf below them is still a single value on the
 * anchor row. A to-many relation is not a value and is not traversed — it is emitted
 * in `loops`, and its own scope comes from calling this again with `{ mapName, model }`
 * set to that relation. A scalar list column stays a value (`isList: true`). Pure.
 */
export const lensScopeSurface = (
  lensOrNarrowing: Lens | LensNarrowing,
  opts: LensScopeSurfaceOptions = {},
): LensScope => {
  const lens = exposedSurface(lensOrNarrowing);
  const startMap = opts.mapName ?? lens.mapName;
  const startModel = opts.model ?? lens.model;
  const values: LensValueOption[] = [];
  const loops: LensLoopOption[] = [];

  const walk = (mapName: string, modelName: string, prefix: string, seen: Set<string>): void => {
    const model = lens.maps[mapName]?.models[modelName];
    if (!model) return;
    const key = `${mapName}:${modelName}`;
    if (seen.has(key)) return;
    const nextSeen = new Set([...seen, key]);

    for (const [name, entry] of Object.entries(model.fields)) {
      const path = prefix ? `${prefix}.${name}` : name;
      if (RELATION_KINDS.has(entry.kind)) {
        const target = relationTarget(entry, mapName);
        if (!target) continue;
        if (entry.isList === true) {
          loops.push({ path, field: name, label: opts.labels?.[path] ?? name, relation: target });
          continue;
        }
        walk(target.mapName, target.modelName, path, nextSeen);
        continue;
      }
      values.push(leafOption(name, entry, path, lens.maps[mapName]?.enums, opts.labels));
    }
  };

  walk(startMap, startModel, '', new Set());
  return { values, loops };
};

/** Memoized hook form of {@link lensScopeSurface}. */
export const useLensScopeSurface = (
  lensOrNarrowing: Lens | LensNarrowing,
  opts: LensScopeSurfaceOptions = {},
): LensScope =>
  // biome-ignore lint/correctness/useExhaustiveDependencies: depend on option fields, not opts identity, so inline literals don't re-run the walk
  useMemo(
    () => lensScopeSurface(lensOrNarrowing, opts),
    [lensOrNarrowing, opts.mapName, opts.model, opts.labels],
  );
