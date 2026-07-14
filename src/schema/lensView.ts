import type { ArrayOperator, Condition, FieldKind, Lens } from '@inixiative/json-rules';
import { useMemo } from 'react';
import { ruleForField } from '../builder/nodes';
import {
  type BuilderField,
  describeModelFields,
  operatorsForKind,
  relationTarget,
  type SurfaceOptions,
} from './surface';

export type LensDecor = { label?: string; icon?: string };

/**
 * A pre-traversed entry point moved up to the builder's root selector.
 *
 * `path` is dotted from the lens anchor. Its shape decides the hoist kind:
 *  - no list relation crossed  → a **leaf**: emits `{ field: path }` directly.
 *  - the *first* segment is a list relation → a **collection**: seeds a top-level
 *    array node over that relation (json-rules can't evaluate a scalar operator
 *    over a list path, so it must be a node, not a flat field).
 *
 * `slice` carves a named view out of a list (EAV `key`/`value`): it becomes the
 * array node's locked `filter`, so "customFields where key=nps" reads as one
 * field "NPS". `arrayOperator` defaults to `any` (has-a-matching-element). `kind`
 * overrides the element leaf's type for untyped `value` columns. Purely
 * presentational — the emitted rule is exactly what the engine already runs.
 */
export type LensViewRoot = {
  path: string;
  slice?: Condition;
  arrayOperator?: ArrayOperator;
  kind?: FieldKind;
} & LensDecor;

/**
 * A display view over a lens: hoisted root entries plus structural/path
 * relabeling. It renames and reorders what the builder *offers*; it never
 * changes what the lens admits or what the engine runs.
 */
export type LensView = {
  roots: LensViewRoot[];
  labels?: {
    /** map decor — `"salesforce"`. (Rendered by model/bridge drill-down; reserved.) */
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

type LeafResolved = { kind: 'leaf'; mapName: string; modelName: string; field: string };
type CollectionResolved = {
  kind: 'collection';
  listField: string;
  target: { mapName: string; modelName: string };
  elementLeaf?: string;
};
type Resolved = LeafResolved | CollectionResolved;

const RELATION_KINDS = new Set(['object', 'bridge']);

/**
 * Classify a hoist path against the lens graph. A path crossing a *list* relation
 * is a collection (must become an array node); one that reaches a scalar/enum
 * through only to-one relations is a leaf. Returns `undefined` — the entry is
 * dropped — for anything unresolvable or out of the single-hop v2 envelope:
 * a scalar mid-segment, a bare relation leaf, or a list not on the anchor model.
 */
const resolvePath = (lens: Lens, path: string): Resolved | undefined => {
  const segments = path.split('.');
  let mapName = lens.mapName;
  let modelName = lens.model;
  for (let i = 0; i < segments.length; i++) {
    const entry = lens.maps[mapName]?.models[modelName]?.fields[segments[i]];
    if (!entry) return undefined;
    if (entry.isList) {
      if (i !== 0) return undefined; // single-hop: the list must be on the anchor
      const target = relationTarget(entry, mapName);
      if (!target) return undefined;
      return {
        kind: 'collection',
        listField: segments[i],
        target,
        elementLeaf: segments.slice(i + 1).join('.') || undefined,
      };
    }
    if (i === segments.length - 1) {
      if (RELATION_KINDS.has(entry.kind)) return undefined; // a bare to-one is not a value
      return { kind: 'leaf', mapName, modelName, field: segments[i] };
    }
    const target = relationTarget(entry, mapName);
    if (!target) return undefined;
    mapName = target.mapName;
    modelName = target.modelName;
  }
  return undefined;
};

const pickDecor = (dict: Record<string, LensDecor> | undefined, ...keys: string[]): LensDecor => {
  if (dict) for (const key of keys) if (dict[key]) return dict[key];
  return {};
};

/** A stable id for a hoisted entry — the selector option value and React key. A
 *  slice makes the same list yield several entries, so it folds into the id. */
const rootId = (root: LensViewRoot): string =>
  root.slice ? `${root.path}#${JSON.stringify(root.slice)}` : root.path;

const buildLeafField = (
  lens: Lens,
  root: LensViewRoot,
  resolved: LeafResolved,
  fieldDecor: Record<string, LensDecor> | undefined,
  opts: SurfaceOptions,
): BuilderField | undefined => {
  const base = describeModelFields(lens, resolved.mapName, resolved.modelName, opts).find(
    (f) => f.name === resolved.field,
  );
  if (!base) return undefined;
  const decor = pickDecor(
    fieldDecor,
    root.path,
    `${resolved.mapName}:${resolved.modelName}.${resolved.field}`,
    `${resolved.modelName}.${resolved.field}`,
  );
  return {
    ...base,
    name: root.path,
    label: root.label ?? decor.label ?? base.label,
    icon: root.icon ?? decor.icon,
  };
};

const buildCollectionField = (
  lens: Lens,
  root: LensViewRoot,
  resolved: CollectionResolved,
  opts: SurfaceOptions,
): BuilderField => {
  const arrayOperator = root.arrayOperator ?? 'any';
  let condition: Condition = { all: [] };
  if (resolved.elementLeaf) {
    let leaf = describeModelFields(
      lens,
      resolved.target.mapName,
      resolved.target.modelName,
      opts,
    ).find((f) => f.name === resolved.elementLeaf);
    if (leaf && root.kind)
      leaf = { ...leaf, kind: root.kind, operators: operatorsForKind(root.kind, opts.targets) };
    if (leaf) condition = { all: [ruleForField(leaf)] };
  }
  const seed: Condition = {
    field: resolved.listField,
    arrayOperator,
    ...(root.slice ? { filter: { all: [root.slice] } } : {}),
    condition,
  } as Condition;
  return {
    name: rootId(root),
    label: root.label ?? resolved.elementLeaf ?? resolved.listField,
    icon: root.icon,
    kind: root.kind ?? 'String',
    isList: true,
    isBridge: false,
    operators: { field: [], date: [], array: [] },
    seed,
  };
};

/**
 * Resolve a view's `roots` into `BuilderField`s to concat onto the anchor
 * surface. Leaf entries emit their real path as the rule `field`; collection
 * entries carry a `seed` array node (with the slice as a locked `filter`) that
 * the selector inserts on select. Unresolvable / out-of-envelope entries are
 * dropped.
 */
export const describeHoistedFields = (
  lens: Lens,
  view: LensView,
  opts: SurfaceOptions = {},
): BuilderField[] => {
  const out: BuilderField[] = [];
  const fieldDecor = view.labels?.fields;
  for (const root of view.roots) {
    const resolved = resolvePath(lens, root.path);
    if (!resolved) continue;
    const field =
      resolved.kind === 'leaf'
        ? buildLeafField(lens, root, resolved, fieldDecor, opts)
        : buildCollectionField(lens, root, resolved, opts);
    if (field) out.push(field);
  }
  return out;
};

/** Top-level fields a view consumes *wholesale* — a bare relation/field hoist
 *  with no slice and no deeper leaf. These are removed from the root selector so
 *  a moved thing lives in exactly one place; sliced/partial/deep hoists leave
 *  their origin intact. */
export const viewConsumedTopFields = (view: LensView | undefined): Set<string> => {
  const consumed = new Set<string>();
  for (const root of view?.roots ?? [])
    if (!root.slice && !root.path.includes('.')) consumed.add(root.path);
  return consumed;
};

const sliceOf = (filter: Condition | undefined): Condition | undefined => {
  if (!filter) return undefined;
  const all = (filter as { all?: Condition[] }).all;
  return Array.isArray(all) ? all[0] : filter;
};

/** The inverse of a hoist: recognize a saved node as one of the view's roots so a
 *  renderer can collapse it back to the named entry (and hide the locked slice)
 *  instead of showing a raw array node. Pure; returns `undefined` when no root
 *  matches. */
export const matchNodeToRoot = (
  lens: Lens,
  view: LensView,
  node: Condition,
): LensViewRoot | undefined => {
  const rec = node as { field?: string; arrayOperator?: string; filter?: Condition };
  for (const root of view.roots) {
    const resolved = resolvePath(lens, root.path);
    if (!resolved) continue;
    if (resolved.kind === 'leaf') {
      if (rec.field === root.path && rec.arrayOperator === undefined) return root;
      continue;
    }
    if (rec.field !== resolved.listField) continue;
    const wantSlice = root.slice ? JSON.stringify(root.slice) : undefined;
    const gotSlice = root.slice ? JSON.stringify(sliceOf(rec.filter)) : undefined;
    if (wantSlice !== gotSlice) continue;
    if (rec.arrayOperator === (root.arrayOperator ?? 'any')) return root;
  }
  return undefined;
};

/** Flatten a view's field/value decor into `SurfaceOptions` label maps so
 *  `describeModelFields` applies the same relabeling to the anchor surface. */
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
