import {
  exposedSurface,
  type FieldKind,
  type Lens,
  type LensNarrowing,
} from '@inixiative/json-rules';
import { useMemo } from 'react';
import { relationTarget, toFieldKind } from './surface';

/** One pickable value-location in a lens. `path` is dotted from the start model
 *  (e.g. `tier`, `account.industry`). The shared atom behind a rule's `field`
 *  (LHS) and `path` (RHS reference), and reusable downstream (permissions, email). */
export type LensValueOption = {
  path: string;
  field: string;
  kind: FieldKind;
  label: string;
  isList: boolean;
  values?: readonly string[];
  /** A `Json` column has no declared sub-fields, but the kernel resolves a dotted
   *  sub-path into it (`check`/`toPrisma`/`toSql`). When set, a renderer may let the
   *  user append a freeform sub-path to `path` (e.g. `metadata` → `metadata.theme`). */
  acceptsSubPath?: boolean;
};

export type LensValuePickerOptions = {
  mapName?: string;
  model?: string;
  /** How many relation hops to traverse. 0 = the start model's own values only. */
  maxDepth?: number;
  /** path → display label override. */
  labels?: Record<string, string>;
};

const RELATION_KINDS = new Set(['object', 'bridge']);

/**
 * Enumerate the value-locations reachable through a lens — every leaf scalar/enum,
 * optionally across relations up to `maxDepth`, as dotted paths. Relations are
 * traversed but never emitted (you pick a value, not a relation). Pure.
 */
export const lensValuePicker = (
  lensOrNarrowing: Lens | LensNarrowing,
  opts: LensValuePickerOptions = {},
): LensValueOption[] => {
  const lens = exposedSurface(lensOrNarrowing);
  const startMap = opts.mapName ?? lens.mapName;
  const startModel = opts.model ?? lens.model;
  const maxDepth = opts.maxDepth ?? 0;
  const out: LensValueOption[] = [];

  const walk = (
    mapName: string,
    modelName: string,
    prefix: string,
    depth: number,
    seen: Set<string>,
  ): void => {
    const model = lens.maps[mapName]?.models[modelName];
    if (!model) return;
    const key = `${mapName}:${modelName}`;
    if (seen.has(key)) return;
    const nextSeen = new Set([...seen, key]);

    for (const [name, entry] of Object.entries(model.fields)) {
      const path = prefix ? `${prefix}.${name}` : name;
      if (RELATION_KINDS.has(entry.kind)) {
        if (depth >= maxDepth) continue;
        const target = relationTarget(entry, mapName);
        if (target) walk(target.mapName, target.modelName, path, depth + 1, nextSeen);
        continue;
      }
      const isEnum = entry.kind === 'enum';
      const kind = isEnum ? 'Enum' : toFieldKind(entry.type);
      out.push({
        path,
        field: name,
        kind,
        label: opts.labels?.[path] ?? name,
        isList: entry.isList === true,
        values: isEnum ? (entry.values ?? lens.maps[mapName]?.enums?.[entry.type]) : entry.values,
        acceptsSubPath: kind === 'Json',
      });
    }
  };

  walk(startMap, startModel, '', 0, new Set());
  return out;
};

/** Memoized hook form of {@link lensValuePicker}. */
export const useLensValuePicker = (
  lensOrNarrowing: Lens | LensNarrowing,
  opts: LensValuePickerOptions = {},
): LensValueOption[] =>
  // biome-ignore lint/correctness/useExhaustiveDependencies: depend on option fields, not opts identity, so inline literals don't re-run the walk
  useMemo(
    () => lensValuePicker(lensOrNarrowing, opts),
    [lensOrNarrowing, opts.mapName, opts.model, opts.maxDepth, opts.labels],
  );
