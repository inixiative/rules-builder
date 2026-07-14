import {
  type Condition,
  checkRuleAgainstLens,
  createLens,
  exposedSurface,
  type FieldKind,
  type Lens,
  type ValueShape,
} from '@inixiative/json-rules';
import { switchGroupOperator } from '../core/decorate';
import { addRule, type RulePath, removeNode, setNode } from '../core/tree';
import {
  type Decoration,
  facetElementLeaf,
  facetId,
  facetLockedLeading,
  matchFacet,
} from '../schema/decoration';
import type { BuilderField, SurfaceOptions } from '../schema/surface';
import { describeModelFields, valueShapeForOperator } from '../schema/surface';
import {
  defaultRule,
  groupChildrenOf,
  groupOperatorOf,
  isArrayNode,
  isGroupNode,
  ruleForField,
} from './nodes';

export type PickOption = { value: string; label: string };

export type FieldControl = {
  value?: string;
  options: PickOption[];
  set: (name: string) => void;
  /** False when the selected field does not resolve in the (narrowed) surface. */
  valid: boolean;
  /** The selected base field is a `Json` column → a freeform sub-path may be appended. */
  acceptsSubPath?: boolean;
  /** The current JSON sub-path (the segment after the base field), if any. */
  subPath?: string;
  /** Set the freeform sub-path; composes `base[.sub]` into the rule's `field`. */
  setSubPath?: (sub: string) => void;
};
export type OperatorControl = {
  value?: string;
  options: PickOption[];
  set: (op: string) => void;
};
export type ValueControl = {
  current: unknown;
  shape: ValueShape;
  /** The field's kind (String/Int/Boolean/DateTime/Enum…) → pick number vs text vs date. */
  kind?: FieldKind;
  /** Present when the value is a constrained set (enum/sourced) → render a select/chips. */
  options?: PickOption[];
  /** False when the value falls outside the field's allowed (enum/sourced) set. */
  valid: boolean;
  set: (value: unknown) => void;
  /** 'value' = a literal; 'path' = compare against another field's value by dotted path;
   *  'bind' = a named binding supplied at execution time (`{ bind }`). */
  mode: 'value' | 'path' | 'bind';
  setMode: (mode: 'value' | 'path' | 'bind') => void;
  /** Present in 'path' mode — the RHS field-reference path (e.g. `user.email`). */
  path?: { value?: string; set: (p: string) => void };
  /** Present in 'bind' mode — the binding name resolved at execution time. */
  bind?: { value?: string; set: (name: string) => void };
};

export type LeafNode = {
  kind: 'leaf';
  id: string;
  path: RulePath;
  depth: number;
  /** A field comparison (`field`) or a raw `true`/`false` literal (`boolean`). */
  leafKind: 'field' | 'boolean';
  /** Flip the leaf between a field comparison and a true/false literal. */
  setLeafKind: (k: 'field' | 'boolean') => void;
  /** Present when `leafKind === 'boolean'` — the literal value. */
  literal?: { value: boolean; set: (v: boolean) => void };
  /** Present when `leafKind === 'field'`. */
  field?: FieldControl;
  operator?: OperatorControl;
  value?: ValueControl;
  /** Set when this leaf is a hoisted alias (a {@link Decoration} leaf facet) — a
   *  renderer shows the entry's label/icon instead of the raw path. */
  hoist?: HoistBadge;
  /** Gated against the allowed value set (sourced/enum) via checkRuleAgainstLens. */
  valid: boolean;
  remove: () => void;
};

/** Marks a node the builder recognized as a hoisted {@link Decoration} facet, so a
 *  renderer collapses it to the named field instead of raw internals. */
export type HoistBadge = { id: string; label: string; icon?: string };

export type GroupNode = {
  kind: 'group';
  id: string;
  path: RulePath;
  depth: number;
  operator: { value: 'all' | 'any'; set: (op: 'all' | 'any') => void };
  children: BuilderNode[];
  addRule: () => void;
  addGroup: () => void;
  canAddGroup: boolean;
  remove?: () => void;
};

/**
 * A list/relation field rule: a predicate / count / presence over the field's
 * elements. `condition` (predicate + count) and `filter` (window: keep elements
 * matching it first) are nested sub-builders scoped to the *related* model's
 * surface — author them like any other group.
 */
export type ArrayNode = {
  kind: 'array';
  id: string;
  path: RulePath;
  depth: number;
  field: FieldControl;
  arrayOperator: {
    value?: string;
    options: PickOption[];
    set: (op: string) => void;
    /** Editable but hidden by default — a hoisted collection ships a sensible
     *  default (`any`); a renderer reveals this control behind an "advanced"
     *  affordance rather than showing it inline. */
    hidden?: boolean;
  };
  /** Set when this array node is a hoisted alias (a {@link Decoration} facet) — a
   *  renderer collapses it to the named field. */
  hoist?: HoistBadge;
  /** The count of leading `condition` children that are the facet's fixed,
   *  non-editable `where` — a renderer hides exactly this many (the identity
   *  block), leaving the rest editable. */
  lockedLeading?: number;
  /** The related model the elements belong to (present for relation lists). */
  relation?: { mapName: string; modelName: string };
  /** Count operators (atLeast/atMost/exactly) → a numeric threshold. */
  count?: { value?: number; set: (n: number | undefined) => void };
  /** Predicate (all/any/none, required) + count (optional) → a sub-condition over the elements. */
  condition?: GroupNode;
  /** Window filter: restrict the elements before the operator applies. */
  filter?: GroupNode;
  /** Drop the filter sub-condition entirely. */
  removeFilter?: () => void;
  /** Gated via checkRuleAgainstLens (validates field + nested condition). */
  valid: boolean;
  remove: () => void;
};

export type BuilderNode = GroupNode | LeafNode | ArrayNode;

type Rec = Record<string, unknown>;
type Ctx = {
  root: Condition;
  maxDepth: number;
  commit: (c: Condition) => void;
  /** The anchor lens + decoration, constant across the tree — used to recognize a
   *  node as a hoisted {@link Decoration} facet and collapse it. */
  anchorLens: Lens;
  decoration?: Decoration;
  surfaceOpts: SurfaceOptions;
};
/** What a node sees: the surface to validate against + its selectable fields. On
 *  descent into an array node's elements, this swaps to the related model. */
type Scope = { lens: Lens; fields: BuilderField[] };

const COUNT_OPS = new Set(['atLeast', 'atMost', 'exactly']);
const PREDICATE_OPS = new Set(['all', 'any', 'none']);
type ArrayCat = 'presence' | 'count' | 'predicate';
const arrayCat = (op: string | undefined): ArrayCat =>
  op && COUNT_OPS.has(op) ? 'count' : op && PREDICATE_OPS.has(op) ? 'predicate' : 'presence';

/** Scalars, enums, json, and list relations are directly rule-able; a to-one
 *  relation is not (you traverse it via a dotted path or its own array node). */
const selectableFields = (fields: BuilderField[]): BuilderField[] =>
  fields.filter((f) => f.selectable !== false && (f.isList || !f.relation));

const idOf = (n: Condition, index: number): string => {
  const r = n as Rec;
  return (r._groupId as string) ?? (r._id as string) ?? String(index);
};

const buildLeaf = (
  node: Condition,
  path: RulePath,
  depth: number,
  ctx: Ctx,
  scope: Scope,
): LeafNode => {
  const id = idOf(node, path.length ? (path[path.length - 1] as number) : 0);
  // A root leaf has no parent array to splice out of — deleting it clears to a blank group.
  const remove = () => ctx.commit(path.length ? removeNode(ctx.root, path) : { all: [] });
  const setLeafKind = (k: 'field' | 'boolean') =>
    ctx.commit(setNode(ctx.root, path, k === 'boolean' ? true : defaultRule(scope.fields)));

  if (typeof node === 'boolean') {
    return {
      kind: 'leaf',
      id,
      path,
      depth,
      leafKind: 'boolean',
      setLeafKind,
      literal: { value: node, set: (v) => ctx.commit(setNode(ctx.root, path, v)) },
      valid: true,
      remove,
    };
  }

  const rec = node as Rec;
  const fieldName = rec.field as string | undefined;
  // Resolve the base field: an exact match, or a Json column carrying a dotted sub-path.
  let field = scope.fields.find((f) => f.name === fieldName);
  let baseName = fieldName;
  let subPath: string | undefined;
  if (!field && fieldName?.includes('.')) {
    const head = fieldName.slice(0, fieldName.indexOf('.'));
    const candidate = scope.fields.find((f) => f.name === head);
    if (candidate?.acceptsSubPath) {
      field = candidate;
      baseName = head;
      subPath = fieldName.slice(head.length + 1);
    }
  }
  const operator = (rec.dateOperator ?? rec.operator) as string | undefined;
  const operatorOptions = field
    ? [...field.operators.field, ...field.operators.date].map((o) => ({
        value: o,
        label: o,
      }))
    : [];
  const shape: ValueShape = operator ? valueShapeForOperator(operator as never) : 'none';
  const valueOptions = field?.enumValues?.map((v) => ({
    value: v,
    label: field.enumLabels?.[v] ?? v,
  }));
  const fieldValid = field !== undefined;
  const valueValid = ((): boolean => {
    const allowed = field?.enumValues;
    if (!allowed) return true;
    const v = rec.value;
    const vals = Array.isArray(v) ? v : [v];
    return vals.every((x) => x == null || typeof x !== 'string' || allowed.includes(x));
  })();
  const valueMode: 'value' | 'path' | 'bind' =
    rec.bind !== undefined ? 'bind' : rec.path !== undefined ? 'path' : 'value';
  const leafMatch =
    ctx.decoration && ctx.anchorLens === scope.lens
      ? matchFacet(ctx.anchorLens, ctx.decoration, node)
      : undefined;
  const leafHoist: HoistBadge | undefined = leafMatch
    ? { id: facetId(leafMatch), label: leafMatch.label ?? baseName ?? '', icon: leafMatch.icon }
    : undefined;

  return {
    kind: 'leaf',
    id,
    path,
    depth,
    leafKind: 'field',
    setLeafKind,
    field: {
      value: baseName,
      options: selectableFields(scope.fields).map((f) => ({
        value: f.name,
        label: f.label,
      })),
      set: (name) => {
        const next = scope.fields.find((f) => f.name === name);
        if (next)
          ctx.commit(setNode(ctx.root, path, ruleForField(next, rec._id as string | undefined)));
      },
      valid: fieldValid,
      acceptsSubPath: field?.acceptsSubPath,
      subPath,
      setSubPath: field?.acceptsSubPath
        ? (sub: string) =>
            ctx.commit(
              setNode(ctx.root, path, {
                ...rec,
                field: sub ? `${baseName}.${sub}` : baseName,
              } as Condition),
            )
        : undefined,
    },
    operator: {
      value: operator,
      options: operatorOptions,
      set: (op) => {
        const isDate = field?.operators.date.includes(op as never) ?? false;
        const { operator: _o, dateOperator: _d, ...rest } = rec;
        ctx.commit(
          setNode(ctx.root, path, {
            ...rest,
            [isDate ? 'dateOperator' : 'operator']: op,
          } as Condition),
        );
      },
    },
    value: {
      current: rec.value,
      shape,
      kind: field?.kind,
      options: valueOptions,
      valid: valueValid,
      set: (value) => ctx.commit(setNode(ctx.root, path, { ...rec, value } as Condition)),
      mode: valueMode,
      setMode: (m) => {
        if (m === valueMode) return;
        const { value: _v, path: _p, bind: _b, ...rest } = rec;
        const next =
          m === 'path'
            ? { ...rest, path: (rec.path as string) ?? '' }
            : m === 'bind'
              ? { ...rest, bind: (rec.bind as string) ?? '' }
              : { ...rest, value: rec.value ?? '' };
        ctx.commit(setNode(ctx.root, path, next as Condition));
      },
      path:
        valueMode === 'path'
          ? {
              value: rec.path as string | undefined,
              set: (p) => {
                const { value: _v, bind: _b, ...rest } = rec;
                ctx.commit(setNode(ctx.root, path, { ...rest, path: p } as Condition));
              },
            }
          : undefined,
      bind:
        valueMode === 'bind'
          ? {
              value: rec.bind as string | undefined,
              set: (name) => {
                const { value: _v, path: _p, ...rest } = rec;
                ctx.commit(setNode(ctx.root, path, { ...rest, bind: name } as Condition));
              },
            }
          : undefined,
    },
    hoist: leafHoist,
    valid: checkRuleAgainstLens(node, scope.lens).ok,
    remove,
  };
};

const buildArray = (
  node: Condition,
  path: RulePath,
  depth: number,
  ctx: Ctx,
  scope: Scope,
): ArrayNode => {
  const rec = node as Rec;
  const fieldName = rec.field as string | undefined;
  const field = scope.fields.find((f) => f.name === fieldName);
  const op = rec.arrayOperator as string | undefined;
  const cat = arrayCat(op);
  const rel = field?.relation;

  // A hoisted collection facet: recognize the node so it renders as its named
  // entry (fixed leading `where` hidden, operator hidden-editable, leaf retyped).
  const matchedFacet =
    ctx.decoration && ctx.anchorLens === scope.lens
      ? matchFacet(ctx.anchorLens, ctx.decoration, node)
      : undefined;
  const overrideLeaf = matchedFacet
    ? facetElementLeaf(ctx.anchorLens, matchedFacet, ctx.surfaceOpts)
    : undefined;

  // Elements belong to the related model → author condition/filter against its surface.
  const relScope: Scope = rel
    ? (() => {
        const relLens = exposedSurface(
          createLens({
            maps: scope.lens.maps,
            mapName: rel.mapName,
            model: rel.modelName,
          }),
        );
        const relFields = describeModelFields(relLens, rel.mapName, rel.modelName);
        return {
          lens: relLens,
          fields: overrideLeaf
            ? relFields.map((f) => (f.name === overrideLeaf.name ? { ...f, ...overrideLeaf } : f))
            : relFields,
        };
      })()
    : scope;

  // A nested condition/filter is a sub-tree: build it over its own root, and on
  // every commit splice the whole sub-condition back under the array rule's key.
  const buildSub = (key: 'condition' | 'filter'): GroupNode => {
    const subRoot = asGroupRoot((rec[key] as Condition | undefined) ?? { all: [] });
    const subCtx: Ctx = {
      ...ctx,
      root: subRoot,
      commit: (next) => ctx.commit(setNode(ctx.root, path, { ...rec, [key]: next } as Condition)),
    };
    return buildGroup(subRoot, [], depth + 1, subCtx, relScope);
  };

  return {
    kind: 'array',
    id: idOf(node, path.length ? (path[path.length - 1] as number) : 0),
    path,
    depth,
    relation: rel,
    field: {
      value: fieldName,
      options: selectableFields(scope.fields).map((f) => ({
        value: f.name,
        label: f.label,
      })),
      set: (name) => {
        const next = scope.fields.find((f) => f.name === name);
        if (next)
          ctx.commit(setNode(ctx.root, path, ruleForField(next, rec._id as string | undefined)));
      },
      valid: field !== undefined,
    },
    hoist: matchedFacet
      ? {
          id: facetId(matchedFacet),
          label: matchedFacet.label ?? fieldName ?? '',
          icon: matchedFacet.icon,
        }
      : undefined,
    lockedLeading: matchedFacet ? facetLockedLeading(matchedFacet) || undefined : undefined,
    arrayOperator: {
      value: op,
      options: (field?.operators.array ?? []).map((o) => ({
        value: o,
        label: o,
      })),
      hidden: matchedFacet ? true : undefined,
      set: (nextOp) => {
        const nextCat = arrayCat(nextOp);
        const { count, condition, ...restRec } = rec;
        const out: Rec = { ...restRec, arrayOperator: nextOp };
        if (nextCat !== 'presence' && condition !== undefined) out.condition = condition;
        if (nextCat === 'count' && count !== undefined) out.count = count;
        ctx.commit(setNode(ctx.root, path, out as Condition));
      },
    },
    count:
      cat === 'count'
        ? {
            value: rec.count as number | undefined,
            set: (n) => ctx.commit(setNode(ctx.root, path, { ...rec, count: n } as Condition)),
          }
        : undefined,
    condition: rel && (cat === 'predicate' || cat === 'count') ? buildSub('condition') : undefined,
    filter: rel ? buildSub('filter') : undefined,
    removeFilter: rel
      ? () => {
          const { filter: _f, ...restRec } = rec;
          ctx.commit(setNode(ctx.root, path, restRec as Condition));
        }
      : undefined,
    valid: checkRuleAgainstLens(node, scope.lens).ok,
    // A root array rule has no parent to splice out of — deleting it clears to a
    // blank group, mirroring the leaf-root behavior.
    remove: () => ctx.commit(path.length ? removeNode(ctx.root, path) : { all: [] }),
  };
};

const buildGroup = (
  node: Condition,
  path: RulePath,
  depth: number,
  ctx: Ctx,
  scope: Scope,
): GroupNode => ({
  kind: 'group',
  id: idOf(node, path.length ? (path[path.length - 1] as number) : 0),
  path,
  depth,
  operator: {
    value: groupOperatorOf(node),
    set: (op) => ctx.commit(setNode(ctx.root, path, switchGroupOperator(node, op))),
  },
  children: groupChildrenOf(node).map((child, i) =>
    buildNode(child, [...path, i], depth + 1, ctx, scope),
  ),
  addRule: () => ctx.commit(addRule(ctx.root, path, defaultRule(scope.fields))),
  addGroup: () => ctx.commit(addRule(ctx.root, path, { all: [] })),
  canAddGroup: depth < ctx.maxDepth,
  remove: path.length ? () => ctx.commit(removeNode(ctx.root, path)) : undefined,
});

const buildNode = (
  node: Condition,
  path: RulePath,
  depth: number,
  ctx: Ctx,
  scope: Scope,
): BuilderNode =>
  isGroupNode(node)
    ? buildGroup(node, path, depth, ctx, scope)
    : isArrayNode(node)
      ? buildArray(node, path, depth, ctx, scope)
      : buildLeaf(node, path, depth, ctx, scope);

/** Normalize a (sub-)condition to a group so it has a compound to add into. Used for the array
 *  node's nested condition/filter sub-trees, which are always groups over the related elements. */
export const asGroupRoot = (cond: Condition | undefined): Condition =>
  cond !== undefined && isGroupNode(cond) ? cond : { all: cond !== undefined ? [cond] : [] };

/** The root is the condition itself — never synthetically wrapped. Only an absent condition
 *  becomes `empty` — a blank group by default (a first-class, add-into-able container), or a
 *  caller-supplied scaffold; a bare leaf or `true`/`false` stays bare. Absence is `undefined`
 *  only: a `null` from a DB row is the caller's to normalize at its own boundary. */
export const asRoot = (cond: Condition | undefined, empty: Condition = { all: [] }): Condition =>
  cond === undefined ? empty : cond;

/**
 * Build the headless descriptor tree from a condition + composed lens. The root is whatever the
 * condition is — a group, a field leaf, an array rule, or a `true`/`false` literal leaf — never
 * force-wrapped. Pure: every action computes the next condition and calls `commit`.
 */
export const buildRoot = (
  root: Condition,
  lens: Lens,
  fields: BuilderField[],
  maxDepth: number,
  commit: (next: Condition) => void,
  opts: { decoration?: Decoration; surfaceOpts?: SurfaceOptions } = {},
): BuilderNode => {
  const normalized = asRoot(root);
  const ctx: Ctx = {
    root: normalized,
    maxDepth,
    commit,
    anchorLens: lens,
    decoration: opts.decoration,
    surfaceOpts: opts.surfaceOpts ?? {},
  };
  return buildNode(normalized, [], 0, ctx, { lens, fields });
};
