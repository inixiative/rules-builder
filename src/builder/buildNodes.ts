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
import type { BuilderField } from '../schema/surface';
import { describeModelFields, valueShapeForOperator } from '../schema/surface';
import { defaultRule, groupChildrenOf, groupOperatorOf, isArrayNode, isGroupNode, ruleForField } from './nodes';

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
  /** 'value' = a literal; 'path' = compare against another field's value by dotted path. */
  mode: 'value' | 'path';
  setMode: (mode: 'value' | 'path') => void;
  /** Present in 'path' mode — the RHS field-reference path (e.g. `user.email`). */
  path?: { value?: string; set: (p: string) => void };
};

export type LeafNode = {
  kind: 'leaf';
  id: string;
  path: RulePath;
  depth: number;
  field: FieldControl;
  operator: OperatorControl;
  value: ValueControl;
  /** Gated against the allowed value set (sourced/enum) via checkRuleAgainstLens. */
  valid: boolean;
  remove: () => void;
};

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
  };
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
const selectableFields = (fields: BuilderField[]): BuilderField[] => fields.filter((f) => f.isList || !f.relation);

const idOf = (n: Condition, index: number): string => {
  const r = n as Rec;
  return (r._groupId as string) ?? (r._id as string) ?? String(index);
};

const buildLeaf = (node: Condition, path: RulePath, depth: number, ctx: Ctx, scope: Scope): LeafNode => {
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
  const valueMode: 'value' | 'path' = rec.path !== undefined ? 'path' : 'value';

  return {
    kind: 'leaf',
    id: idOf(node, path[path.length - 1] as number),
    path,
    depth,
    field: {
      value: baseName,
      options: selectableFields(scope.fields).map((f) => ({
        value: f.name,
        label: f.label,
      })),
      set: (name) => {
        const next = scope.fields.find((f) => f.name === name);
        if (next) ctx.commit(setNode(ctx.root, path, ruleForField(next, rec._id as string | undefined)));
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
        const { value: _v, path: _p, ...rest } = rec;
        const next = m === 'path' ? { ...rest, path: (rec.path as string) ?? '' } : { ...rest, value: rec.value ?? '' };
        ctx.commit(setNode(ctx.root, path, next as Condition));
      },
      path:
        valueMode === 'path'
          ? {
              value: rec.path as string | undefined,
              set: (p) => {
                const { value: _v, ...rest } = rec;
                ctx.commit(setNode(ctx.root, path, { ...rest, path: p } as Condition));
              },
            }
          : undefined,
    },
    valid: checkRuleAgainstLens(node, scope.lens).ok,
    remove: () => ctx.commit(removeNode(ctx.root, path)),
  };
};

const buildArray = (node: Condition, path: RulePath, depth: number, ctx: Ctx, scope: Scope): ArrayNode => {
  const rec = node as Rec;
  const fieldName = rec.field as string | undefined;
  const field = scope.fields.find((f) => f.name === fieldName);
  const op = rec.arrayOperator as string | undefined;
  const cat = arrayCat(op);
  const rel = field?.relation;

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
        return {
          lens: relLens,
          fields: describeModelFields(relLens, rel.mapName, rel.modelName),
        };
      })()
    : scope;

  // A nested condition/filter is a sub-tree: build it over its own root, and on
  // every commit splice the whole sub-condition back under the array rule's key.
  const buildSub = (key: 'condition' | 'filter'): GroupNode => {
    const subRoot = asGroupRoot((rec[key] as Condition | undefined) ?? { all: [] });
    const subCtx: Ctx = {
      root: subRoot,
      maxDepth: ctx.maxDepth,
      commit: (next) => ctx.commit(setNode(ctx.root, path, { ...rec, [key]: next } as Condition)),
    };
    return buildGroup(subRoot, [], depth + 1, subCtx, relScope);
  };

  return {
    kind: 'array',
    id: idOf(node, path[path.length - 1] as number),
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
        if (next) ctx.commit(setNode(ctx.root, path, ruleForField(next, rec._id as string | undefined)));
      },
      valid: field !== undefined,
    },
    arrayOperator: {
      value: op,
      options: (field?.operators.array ?? []).map((o) => ({
        value: o,
        label: o,
      })),
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
    remove: () => ctx.commit(removeNode(ctx.root, path)),
  };
};

const buildGroup = (node: Condition, path: RulePath, depth: number, ctx: Ctx, scope: Scope): GroupNode => ({
  kind: 'group',
  id: idOf(node, path.length ? (path[path.length - 1] as number) : 0),
  path,
  depth,
  operator: {
    value: groupOperatorOf(node),
    set: (op) => ctx.commit(setNode(ctx.root, path, switchGroupOperator(node, op))),
  },
  children: groupChildrenOf(node).map((child, i) => buildNode(child, [...path, i], depth + 1, ctx, scope)),
  addRule: () => ctx.commit(addRule(ctx.root, path, defaultRule(scope.fields))),
  addGroup: () => ctx.commit(addRule(ctx.root, path, { all: [] })),
  canAddGroup: depth < ctx.maxDepth,
  remove: path.length ? () => ctx.commit(removeNode(ctx.root, path)) : undefined,
});

const buildNode = (node: Condition, path: RulePath, depth: number, ctx: Ctx, scope: Scope): BuilderNode =>
  isGroupNode(node)
    ? buildGroup(node, path, depth, ctx, scope)
    : isArrayNode(node)
      ? buildArray(node, path, depth, ctx, scope)
      : buildLeaf(node, path, depth, ctx, scope);

/** Normalize to a group root so the tree always has a compound to add into. */
export const asGroupRoot = (cond: Condition | undefined): Condition =>
  cond !== undefined && isGroupNode(cond) ? cond : { all: cond !== undefined ? [cond] : [] };

/**
 * Build the headless descriptor tree from a condition + composed lens. Pure: every
 * action computes the next condition and calls `commit`. The consumer renders.
 */
export const buildRoot = (
  root: Condition,
  lens: Lens,
  fields: BuilderField[],
  maxDepth: number,
  commit: (next: Condition) => void,
): GroupNode => {
  const normalized = asGroupRoot(root);
  const ctx: Ctx = { root: normalized, maxDepth, commit };
  return buildGroup(normalized, [], 0, ctx, { lens, fields });
};
