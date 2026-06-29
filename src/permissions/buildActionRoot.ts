import type { Condition, Lens } from '@inixiative/json-rules';
import { buildRoot, type GroupNode, type PickOption } from '../builder/buildNodes';
import type { BuilderField } from '../schema/surface';
import {
  type ActionPath,
  actionKind,
  addActionChild,
  childrenOfAction,
  removeActionNode,
  setActionNode,
} from './actionTree';
import type { ActionRule, ActionRuleKind } from './types';

const KIND_OPTIONS: PickOption[] = [
  { value: 'rule', label: 'rule (abac)' },
  { value: 'self', label: 'self (owner)' },
  { value: 'rel', label: 'rel (walk)' },
  { value: 'delegate', label: 'delegate' },
  { value: 'any', label: 'any (OR)' },
  { value: 'all', label: 'all (AND)' },
  { value: 'deny', label: 'deny' },
];

const defaultForKind = (kind: ActionRuleKind): ActionRule => {
  switch (kind) {
    case 'delegate':
      return '';
    case 'rel':
      return { rel: '', action: '' };
    case 'self':
      return { self: '' };
    case 'rule':
      return { rule: { all: [] } };
    case 'any':
      return { any: [] };
    case 'all':
      return { all: [] };
    case 'deny':
      return null;
  }
};

type KindControl = { value: ActionRuleKind; options: PickOption[]; set: (k: ActionRuleKind) => void };
type Control = { value?: string; options: PickOption[]; set: (v: string) => void };

type BaseNode = { id: string; path: ActionPath; depth: number; kind: KindControl; remove?: () => void };
export type ActionLeafNode = BaseNode & {
  delegate?: Control;
  rel?: { relation: Control; action: Control; target?: string };
  self?: Control;
  rule?: GroupNode;
};
export type ActionGroupNode = BaseNode & { children: ActionRuleNode[]; addChild?: () => void };
export type ActionRuleNode = ActionLeafNode | ActionGroupNode;

export type BuildActionOptions = {
  lens: Lens;
  fields: BuilderField[];
  /** Other action names on this model — delegate targets. */
  siblingActions: string[];
  /** Action names per model — the `rel` walk's target actions. */
  actionsByModel: Record<string, string[]>;
  maxDepth?: number;
  commit: (next: ActionRule) => void;
};

type Ctx = Required<Omit<BuildActionOptions, 'maxDepth'>> & { root: ActionRule; maxDepth: number };

const opt = (v: string): PickOption => ({ value: v, label: v });

const build = (node: ActionRule, path: ActionPath, depth: number, ctx: Ctx): ActionRuleNode => {
  const kind = actionKind(node);
  const base: BaseNode = {
    id: path.length ? path.join('.') : 'root',
    path,
    depth,
    kind: {
      value: kind,
      options: KIND_OPTIONS,
      set: (k) => ctx.commit(setActionNode(ctx.root, path, defaultForKind(k))),
    },
    remove: path.length ? () => ctx.commit(removeActionNode(ctx.root, path)) : undefined,
  };

  if (kind === 'any' || kind === 'all') {
    return {
      ...base,
      children: childrenOfAction(node).map((c, i) => build(c, [...path, i], depth + 1, ctx)),
      addChild: depth < ctx.maxDepth ? () => ctx.commit(addActionChild(ctx.root, path)) : undefined,
    };
  }

  if (kind === 'delegate') {
    return {
      ...base,
      delegate: {
        value: node as string,
        options: ctx.siblingActions.map(opt),
        set: (a) => ctx.commit(setActionNode(ctx.root, path, a)),
      },
    };
  }

  if (kind === 'self') {
    return {
      ...base,
      self: {
        value: (node as { self: string }).self,
        options: ctx.fields.filter((f) => !f.relation).map((f) => opt(f.name)),
        set: (f) => ctx.commit(setActionNode(ctx.root, path, { self: f })),
      },
    };
  }

  if (kind === 'rel') {
    const rel = node as { rel: string; action: string };
    const target = ctx.fields.find((f) => f.name === rel.rel)?.relation?.modelName;
    return {
      ...base,
      rel: {
        relation: {
          value: rel.rel,
          options: ctx.fields.filter((f) => f.relation).map((f) => opt(f.name)),
          set: (r) => ctx.commit(setActionNode(ctx.root, path, { rel: r, action: rel.action })),
        },
        action: {
          value: rel.action,
          options: ((target && ctx.actionsByModel[target]) || []).map(opt),
          set: (a) => ctx.commit(setActionNode(ctx.root, path, { rel: rel.rel, action: a })),
        },
        target,
      },
    };
  }

  // rule (abac) — embed the condition builder; its commits fold back as { rule }.
  const cond = (node as { rule: Condition }).rule;
  return {
    ...base,
    rule: buildRoot(cond, ctx.lens, ctx.fields, ctx.maxDepth, (next) =>
      ctx.commit(setActionNode(ctx.root, path, { rule: next })),
    ),
  };
};

export const buildActionRoot = (rule: ActionRule, opts: BuildActionOptions): ActionRuleNode =>
  build(rule, [], 0, { ...opts, root: rule, maxDepth: opts.maxDepth ?? 4 });
