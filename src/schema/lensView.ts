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
 * `path` is dotted from the lens anchor and may traverse any number of to-one
 * relations (including `map:Model` bridges). Its shape decides the hoist kind:
 *  - reaches a scalar/enum through only to-one hops → a **leaf**: emits
 *    `{ field: path }` directly.
 *  - crosses a *list* relation → a **collection**: seeds a top-level array node
 *    over that relation (json-rules can't evaluate a scalar operator over a list
 *    path, so it must be a node, not a flat field).
 *
 * `where` carves a named view out of a list (the EAV `key`/`value` pattern): it
 * becomes the array node's locked `filter`, so "customFields where key=nps" reads
 * as one field "NPS". It is authored, never customer-editable. `arrayOperator`
 * defaults to `any` (has-a-matching-element); the builder keeps it editable but
 * hidden. `kind` overrides the element leaf's type for untyped `value` columns.
 * Purely presentational — the emitted rule is exactly what the engine runs.
 */
export type LensViewRoot = {
  path: string;
  where?: Condition;
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
  listOwner: { mapName: string; modelName: string };
  listField: string;
  listPath: string;
  target: { mapName: string; modelName: string };
  elementLeaf?: string;
};
type Resolved = LeafResolved | CollectionResolved;

const RELATION_KINDS = new Set(['object', 'bridge']);

/**
 * Classify a hoist path against the lens graph. To-one hops are traversed freely;
 * the first *list* relation makes it a collection anchored there, with the
 * remainder as the element leaf. Returns `undefined` — the entry is dropped —
 * for an unresolvable path or a bare relation leaf (not a value).
 */
const resolvePath = (lens: Lens, path: string): Resolved | undefined => {
  const segments = path.split('.');
  let mapName = lens.mapName;
  let modelName = lens.model;
  for (let i = 0; i < segments.length; i++) {
    const entry = lens.maps[mapName]?.models[modelName]?.fields[segments[i]];
    if (!entry) return undefined;
    if (entry.isList) {
      const target = relationTarget(entry, mapName);
      if (!target) return undefined;
      return {
        kind: 'collection',
        listOwner: { mapName, modelName },
        listField: segments[i],
        listPath: segments.slice(0, i + 1).join('.'),
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
 *  `where` makes the same list yield several entries, so it folds into the id. */
export const rootId = (root: LensViewRoot): string =>
  root.where ? `${root.path}#${JSON.stringify(root.where)}` : root.path;

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

/** The element leaf's descriptor, with any `kind` override applied — used both to
 *  seed the value rule and (on rehydration) to retype the element surface. */
export const overrideElementLeaf = (
  lens: Lens,
  resolved: CollectionResolved,
  kind: FieldKind | undefined,
  opts: SurfaceOptions,
): BuilderField | undefined => {
  if (!resolved.elementLeaf) return undefined;
  const leaf = describeModelFields(
    lens,
    resolved.target.mapName,
    resolved.target.modelName,
    opts,
  ).find((f) => f.name === resolved.elementLeaf);
  if (!leaf) return undefined;
  return kind ? { ...leaf, kind, operators: operatorsForKind(kind, opts.targets) } : leaf;
};

const collectionSeed = (
  lens: Lens,
  root: LensViewRoot,
  resolved: CollectionResolved,
  opts: SurfaceOptions,
): Condition => {
  const leaf = overrideElementLeaf(lens, resolved, root.kind, opts);
  return {
    field: resolved.listPath,
    arrayOperator: root.arrayOperator ?? 'any',
    ...(root.where ? { filter: { all: [root.where] } } : {}),
    condition: leaf ? { all: [ruleForField(leaf)] } : { all: [] },
  } as Condition;
};

/**
 * Resolve a view's `roots` into `BuilderField`s to concat onto the anchor
 * surface. A leaf entry emits its real path as the rule `field`. A collection
 * entry contributes a **selector** field (carrying the `seed` array node the
 * picker inserts) and, when the array field isn't itself pickable, a non-pickable
 * **resolver** field so the seeded node's dotted `field` resolves its relation.
 */
export const describeHoistedFields = (
  lens: Lens,
  view: LensView,
  opts: SurfaceOptions = {},
): BuilderField[] => {
  const out: BuilderField[] = [];
  const fieldDecor = view.labels?.fields;
  const resolverFor = new Set<string>();
  for (const root of view.roots) {
    const resolved = resolvePath(lens, root.path);
    if (!resolved) continue;
    if (resolved.kind === 'leaf') {
      const field = buildLeafField(lens, root, resolved, fieldDecor, opts);
      if (field) out.push(field);
      continue;
    }
    const id = rootId(root);
    const isWhole = id === resolved.listPath;
    out.push({
      name: id,
      label: root.label ?? resolved.elementLeaf ?? resolved.listField,
      icon: root.icon,
      kind: root.kind ?? 'String',
      isList: true,
      isBridge: false,
      relation: isWhole ? resolved.target : undefined,
      operators: { field: [], date: [], array: [] },
      seed: collectionSeed(lens, root, resolved, opts),
    });
    if (!isWhole && !resolverFor.has(resolved.listPath)) {
      resolverFor.add(resolved.listPath);
      const list = describeModelFields(
        lens,
        resolved.listOwner.mapName,
        resolved.listOwner.modelName,
        opts,
      ).find((f) => f.name === resolved.listField);
      if (list) out.push({ ...list, name: resolved.listPath, selectable: false, seed: undefined });
    }
  }
  return out;
};

/** Top-level fields a view consumes *wholesale* — a bare relation/field hoist
 *  with no `where` and no deeper leaf. These are removed from the root selector so
 *  a moved thing lives in exactly one place; `where`/partial/deep hoists leave
 *  their origin intact. */
export const viewConsumedTopFields = (view: LensView | undefined): Set<string> => {
  const consumed = new Set<string>();
  for (const root of view?.roots ?? [])
    if (!root.where && !root.path.includes('.')) consumed.add(root.path);
  return consumed;
};

const oneOf = (group: Condition | undefined): Condition | undefined => {
  if (!group) return undefined;
  const all = (group as { all?: Condition[] }).all;
  return Array.isArray(all) ? all[0] : group;
};

// A rehydrated node carries builder/engine metadata the authored `where` never
// has (coerceType from stampCoercions, _id/_groupId from the tree). Strip it and
// sort keys so the structural comparison is order- and coercion-insensitive.
const META = new Set(['coerceType', '_id', '_groupId']);
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort())
      if (!META.has(key)) out[key] = canonical((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
};

/** The inverse of a hoist: recognize a saved node as one of the view's roots so a
 *  renderer (and `buildRoot`) can collapse it back to the named entry (hiding the
 *  locked `where`) instead of a raw array node. Pure; `undefined` when no root
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
    if (rec.field !== resolved.listPath) continue;
    const want = root.where ? JSON.stringify(canonical(root.where)) : undefined;
    const got = root.where ? JSON.stringify(canonical(oneOf(rec.filter))) : undefined;
    if (want !== got) continue;
    if (rec.arrayOperator === (root.arrayOperator ?? 'any')) return root;
  }
  return undefined;
};

/** The resolved collection facts for a matched root — the element leaf (retyped)
 *  a renderer/`buildRoot` needs when collapsing a rehydrated node. */
export const collapsedElementLeaf = (
  lens: Lens,
  root: LensViewRoot,
  opts: SurfaceOptions = {},
): BuilderField | undefined => {
  const resolved = resolvePath(lens, root.path);
  if (resolved?.kind !== 'collection') return undefined;
  return overrideElementLeaf(lens, resolved, root.kind, opts);
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
