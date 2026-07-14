import type { Lens } from '@inixiative/json-rules';
import { useMemo } from 'react';
import {
  type BuilderField,
  describeModelFields,
  relationTarget,
  type SurfaceOptions,
} from './surface';

export type LensDecor = { label?: string; icon?: string };

/** A pre-traversed entry point moved up to the builder's root selector. `path`
 *  is dotted from the lens anchor and may cross `map:Model` bridge segments
 *  (e.g. `salesforce:Contact.industry`). The emitted rule carries `path`
 *  verbatim as its `field`, so json-rules resolves it unchanged — a hoist is a
 *  presentation move, never a semantic one. */
export type LensViewRoot = { path: string } & LensDecor;

/**
 * A display view over a lens: the hoisted root entries plus structural/path
 * relabeling. It renames and reorders what the builder *offers*; it never
 * changes what the lens admits or what the engine runs. The lens stays the sole
 * source of truth.
 */
export type LensView = {
  /** Extra root-level selectables, additive to the anchor model's own fields. */
  roots: LensViewRoot[];
  labels?: {
    /** map decor — `"salesforce"`. (Rendered by model/bridge hoisting; reserved.) */
    maps?: Record<string, LensDecor>;
    /** model / bridge-badge decor — `"salesforce:Contact"` or `"Contact"`. (Reserved.) */
    models?: Record<string, LensDecor>;
    /** field decor, keyed by full path from the anchor, or structurally
     *  (`map:Model.field` / `Model.field`). Path key wins over structural. */
    fields?: Record<string, LensDecor>;
    /** enum/sourced value decor, keyed like `fields` → (value → decor). */
    values?: Record<string, Record<string, LensDecor>>;
  };
};

type Owner = { mapName: string; modelName: string; field: string };

/** Walk a dotted path from the anchor to the model that owns its final segment.
 *  Every non-final segment must be a relation/bridge; a scalar mid-path is not
 *  traversable and yields `undefined` (the entry is dropped). */
const walkToOwner = (lens: Lens, path: string): Owner | undefined => {
  const segments = path.split('.');
  const field = segments.pop();
  if (!field) return undefined;
  let mapName = lens.mapName;
  let modelName = lens.model;
  for (const segment of segments) {
    const entry = lens.maps[mapName]?.models[modelName]?.fields[segment];
    if (!entry) return undefined;
    const target = relationTarget(entry, mapName);
    if (!target) return undefined;
    mapName = target.mapName;
    modelName = target.modelName;
  }
  return { mapName, modelName, field };
};

const pickDecor = (dict: Record<string, LensDecor> | undefined, ...keys: string[]): LensDecor => {
  if (dict) for (const key of keys) if (dict[key]) return dict[key];
  return {};
};

/** Flatten a view's field/value decor into `SurfaceOptions` label maps so
 *  `describeModelFields` applies the same relabeling to the anchor surface (and,
 *  reused, to hoisted owners). Icons live on hoisted entries, not here. */
export const viewSurfaceOptions = (view: LensView | undefined): SurfaceOptions => {
  const labels: Record<string, string> = {};
  for (const [key, decor] of Object.entries(view?.labels?.fields ?? {}))
    if (decor.label !== undefined) labels[key] = decor.label;

  const valueLabels: Record<string, Record<string, string>> = {};
  for (const [field, values] of Object.entries(view?.labels?.values ?? {})) {
    const perValue: Record<string, string> = {};
    for (const [value, decor] of Object.entries(values))
      if (decor.label !== undefined) perValue[value] = decor.label;
    if (Object.keys(perValue).length) valueLabels[field] = perValue;
  }

  return { labels, valueLabels };
};

/**
 * Resolve a view's hoisted `roots` into `BuilderField`s ready to concat onto the
 * anchor model's fields. Each entry is walked to its owning model and described
 * with the full existing surface logic (operators, enum values, JSON sub-path),
 * then re-`name`d to its full path so the emitted rule addresses the real lens
 * location. Inline `label`/`icon` on the entry win over the structural relabel.
 */
export const describeHoistedFields = (
  lens: Lens,
  view: LensView,
  opts: SurfaceOptions = {},
): BuilderField[] => {
  const out: BuilderField[] = [];
  for (const root of view.roots) {
    const owner = walkToOwner(lens, root.path);
    if (!owner) continue;
    const base = describeModelFields(lens, owner.mapName, owner.modelName, opts).find(
      (f) => f.name === owner.field,
    );
    if (!base) continue;
    const decor = pickDecor(
      view.labels?.fields,
      root.path,
      `${owner.mapName}:${owner.modelName}.${owner.field}`,
      `${owner.modelName}.${owner.field}`,
    );
    out.push({
      ...base,
      name: root.path,
      label: root.label ?? decor.label ?? base.label,
      icon: root.icon ?? decor.icon,
    });
  }
  return out;
};

/** Memoized hook form of {@link describeHoistedFields}. */
export const useHoistedFields = (
  lens: Lens,
  view: LensView | undefined,
  opts: SurfaceOptions = {},
): BuilderField[] =>
  // biome-ignore lint/correctness/useExhaustiveDependencies: depend on option fields, not opts identity, so inline literals don't re-run the walk
  useMemo(
    () => (view ? describeHoistedFields(lens, view, opts) : []),
    [lens, view, opts.targets, opts.labels, opts.valueLabels],
  );
