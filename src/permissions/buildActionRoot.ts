import type { Condition, Lens } from '@inixiative/json-rules';
import { type BuilderNode, buildRoot, type PickOption } from '../builder/buildNodes';
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
  { value: 'allow', label: 'allow (true)' },
  { value: 'deny', label: 'deny (false)' },
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
    case 'allow':
      return true;
    case 'deny':
      return false; // prefer `false` over `null` (both deny); `null` still reads as deny
  }
};

type KindControl = {
  value: ActionRuleKind;
  options: PickOption[];
  set: (k: ActionRuleKind) => void;
};
type Control = { value?: string; options: PickOption[]; set: (v: string) => void };

type BaseNode = {
  id: string;
  path: ActionPath;
  depth: number;
  kind: KindControl;
  remove?: () => void;
};
/** A `rel` walk as a path of hops: one segment per relation crossed, each scoped to the resource
 *  reached so far (intra-map relations + bridges). `target` is the final resource. */
export type RelControl = {
  segments: Control[];
  /** Relations available to append as the next hop (of the final resource). */
  addOptions: PickOption[];
  addSegment: (relation: string) => void;
  removeLast?: () => void;
  action: Control;
  target?: string;
};
export type ActionLeafNode = BaseNode & {
  delegate?: Control;
  rel?: RelControl;
  self?: Control;
  rule?: BuilderNode;
};
export type ActionGroupNode = BaseNode & { children: ActionRuleNode[]; addChild?: () => void };
export type ActionRuleNode = ActionLeafNode | ActionGroupNode;

export type BuildActionOptions = {
  lens: Lens;
  fields: BuilderField[];
  /** Other action names on this resource — delegate targets. */
  siblingActions: string[];
  /** Action names per resource (`map:model`) — the `rel` walk's target actions. */
  actionsByResource: Record<string, string[]>;
  /** Fields of any resource (`map:model`) — needed to scope hops past the first. */
  resourceFields?: (resource: string) => BuilderField[];
  maxDepth?: number;
  commit: (next: ActionRule) => void;
};

type Ctx = Required<Omit<BuildActionOptions, 'maxDepth' | 'resourceFields'>> & {
  root: ActionRule;
  maxDepth: number;
  resourceFields?: (resource: string) => BuilderField[];
};

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
    const currentResource = `${ctx.lens.mapName}:${ctx.lens.model}`;
    const fieldsAt = (resource: string): BuilderField[] =>
      resource === currentResource ? ctx.fields : (ctx.resourceFields?.(resource) ?? []);
    const relTargetOf = (f: BuilderField | undefined): string | undefined =>
      f?.relation ? `${f.relation.mapName}:${f.relation.modelName}` : undefined;
    // Only to-one relations are walkable — a hop evaluates a single record, so the "many" side
    // (a list relation / the one→many bridge direction) is never a valid rel target.
    const relOptionsAt = (resource: string) =>
      fieldsAt(resource)
        .filter((f) => f.relation && !f.isList)
        .map((f) => opt(f.name));
    // Editing the relation path can move the target resource, so the previously-picked action
    // (an action on the OLD target) no longer applies — reset it. Only `action.set` keeps it.
    const setRel = (next: string) =>
      ctx.commit(setActionNode(ctx.root, path, { rel: next, action: '' }));

    const segs = rel.rel ? rel.rel.split('.') : [];
    let resource = currentResource;
    let resolved = true;
    const segments: Control[] = segs.map((seg, i) => {
      const optionsResource = resource;
      const next = relTargetOf(fieldsAt(resource).find((x) => x.name === seg));
      if (next) resource = next;
      else resolved = false;
      // Changing a hop truncates everything past it (deeper hops are scoped to it).
      return {
        value: seg,
        options: relOptionsAt(optionsResource),
        set: (r) => setRel([...segs.slice(0, i), r].join('.')),
      };
    });
    const target = resolved ? resource : undefined;

    return {
      ...base,
      rel: {
        segments,
        addOptions: target ? relOptionsAt(target) : [],
        addSegment: (r) => setRel([...segs, r].join('.')),
        removeLast: segs.length ? () => setRel(segs.slice(0, -1).join('.')) : undefined,
        action: {
          value: rel.action,
          options: ((target && ctx.actionsByResource[target]) || []).map(opt),
          set: (a) => ctx.commit(setActionNode(ctx.root, path, { rel: rel.rel, action: a })),
        },
        target,
      },
    };
  }

  if (kind === 'allow' || kind === 'deny') return base; // terminal true/false — kind picker only, no operands

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
