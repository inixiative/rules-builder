import type { FieldKind, FieldMapEntry, Lens, LensNarrowing } from '@inixiative/json-rules';
import { useMemo } from 'react';
import { createView, relationTarget, toFieldKind, viewAt, viewRoot, visitOf } from './surface';

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
  /** Where to start: a dotted relation path from the lens anchor (`orders`). The anchor
   *  by default. */
  at?: string;
  /** How many relation hops to traverse. 0 = the start model's own values only. */
  maxDepth?: number;
  /** path → display label override. */
  labels?: Record<string, string>;
};

/** The pickable option for one leaf (scalar/enum) field at `path`. Enum values are the
 *  ones the lens allows at that visit. Shared by every walk over a lens so they all emit
 *  the same option shape. */
export const leafOption = (
  name: string,
  entry: FieldMapEntry,
  path: string,
  labels?: Record<string, string>,
): LensValueOption => {
  const isEnum = entry.kind === 'enum';
  const kind: FieldKind = isEnum ? 'Enum' : toFieldKind(entry.type);
  return {
    path,
    field: name,
    kind,
    label: labels?.[path] ?? name,
    isList: entry.isList === true,
    values: entry.values,
    acceptsSubPath: kind === 'Json',
  };
};

/**
 * Enumerate the value-locations reachable through a lens — every leaf scalar/enum,
 * optionally across the relations it turns on, up to `maxDepth`, as dotted paths from
 * the start. Each visit reads what the lens shows on that path. Relations are traversed
 * but never emitted (you pick a value, not a relation). Pure.
 */
export const lensValuePicker = (
  lensOrNarrowing: Lens | LensNarrowing,
  opts: LensValuePickerOptions = {},
): LensValueOption[] => {
  const view = createView(lensOrNarrowing);
  const maxDepth = opts.maxDepth ?? 0;
  const out: LensValueOption[] = [];

  const walk = (scope: ReturnType<typeof viewRoot>, prefix: string, depth: number): void => {
    const visit = visitOf(scope);
    if (!visit) return;

    for (const [name, entry] of Object.entries(visit.fields)) {
      const path = prefix ? `${prefix}.${name}` : name;
      if (relationTarget(entry, visit.mapName)) {
        if (depth < maxDepth) walk(viewAt(scope, name), path, depth + 1);
        continue;
      }
      out.push(leafOption(name, entry, path, opts.labels));
    }
  };

  walk(viewAt(viewRoot(view), opts.at ?? ''), '', 0);
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
    [lensOrNarrowing, opts.at, opts.maxDepth, opts.labels],
  );
