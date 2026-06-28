import {
  checkRuleAgainstLens,
  type Condition,
  type FieldKind,
  type Lens,
  type ValueShape,
} from '@inixiative/json-rules';
import { switchGroupOperator } from '../core/decorate';
import { addRule, removeNode, type RulePath, setNode } from '../core/tree';
import type { BuilderField } from '../schema/surface';
import { valueShapeForOperator } from '../schema/surface';
import { defaultRule, groupChildrenOf, groupOperatorOf, isGroupNode, ruleForField } from './nodes';

export type PickOption = { value: string; label: string };

export type FieldControl = { value?: string; options: PickOption[]; set: (name: string) => void };
export type OperatorControl = { value?: string; options: PickOption[]; set: (op: string) => void };
export type ValueControl = {
  current: unknown;
  shape: ValueShape;
  /** The field's kind (String/Int/Boolean/DateTime/Enum…) → pick number vs text vs date. */
  kind?: FieldKind;
  /** Present when the value is a constrained set (enum/sourced) → render a select/chips. */
  options?: PickOption[];
  set: (value: unknown) => void;
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

export type BuilderNode = GroupNode | LeafNode;

type Rec = Record<string, unknown>;
type Ctx = { root: Condition; lens: Lens; fields: BuilderField[]; maxDepth: number; commit: (c: Condition) => void };

const idOf = (n: Condition, index: number): string => {
  const r = n as Rec;
  return (r._groupId as string) ?? (r._id as string) ?? String(index);
};

const buildLeaf = (node: Condition, path: RulePath, depth: number, ctx: Ctx): LeafNode => {
  const rec = node as Rec;
  const fieldName = rec.field as string | undefined;
  const field = ctx.fields.find((f) => f.name === fieldName);
  const operator = (rec.dateOperator ?? rec.operator) as string | undefined;
  const operatorOptions = field
    ? [...field.operators.field, ...field.operators.date].map((o) => ({ value: o, label: o }))
    : [];
  const shape: ValueShape = operator ? valueShapeForOperator(operator as never) : 'none';
  const valueOptions = field?.enumValues?.map((v) => ({ value: v, label: v }));

  return {
    kind: 'leaf',
    id: idOf(node, path[path.length - 1] as number),
    path,
    depth,
    field: {
      value: fieldName,
      options: ctx.fields.map((f) => ({ value: f.name, label: f.label })),
      set: (name) => {
        const next = ctx.fields.find((f) => f.name === name);
        if (next) ctx.commit(setNode(ctx.root, path, ruleForField(next, rec._id as string | undefined)));
      },
    },
    operator: {
      value: operator,
      options: operatorOptions,
      set: (op) => {
        const isDate = field?.operators.date.includes(op as never) ?? false;
        const { operator: _o, dateOperator: _d, ...rest } = rec;
        ctx.commit(setNode(ctx.root, path, { ...rest, [isDate ? 'dateOperator' : 'operator']: op } as Condition));
      },
    },
    value: {
      current: rec.value,
      shape,
      kind: field?.kind,
      options: valueOptions,
      set: (value) => ctx.commit(setNode(ctx.root, path, { ...rec, value } as Condition)),
    },
    valid: checkRuleAgainstLens(node, ctx.lens).ok,
    remove: () => ctx.commit(removeNode(ctx.root, path)),
  };
};

const buildGroup = (node: Condition, path: RulePath, depth: number, ctx: Ctx): GroupNode => ({
  kind: 'group',
  id: idOf(node, path.length ? (path[path.length - 1] as number) : 0),
  path,
  depth,
  operator: {
    value: groupOperatorOf(node),
    set: (op) => ctx.commit(setNode(ctx.root, path, switchGroupOperator(node, op))),
  },
  children: groupChildrenOf(node).map((child, i) => buildNode(child, [...path, i], depth + 1, ctx)),
  addRule: () => ctx.commit(addRule(ctx.root, path, defaultRule(ctx.fields))),
  addGroup: () => ctx.commit(addRule(ctx.root, path, { all: [] })),
  canAddGroup: depth < ctx.maxDepth,
  remove: path.length ? () => ctx.commit(removeNode(ctx.root, path)) : undefined,
});

const buildNode = (node: Condition, path: RulePath, depth: number, ctx: Ctx): BuilderNode =>
  isGroupNode(node) ? buildGroup(node, path, depth, ctx) : buildLeaf(node, path, depth, ctx);

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
  const ctx: Ctx = { root: normalized, lens, fields, maxDepth, commit };
  return buildGroup(normalized, [], 0, ctx);
};
