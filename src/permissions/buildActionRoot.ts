import { type Condition, engineGlobals, type ValidationIssue } from '@inixiative/json-rules';
import {
  declaredListsOf,
  type LensesAtRow,
  lensesAtListItem,
  lensesAtRow,
  relationHopsFrom,
  type SchemaMap,
  validateActionRule,
} from '@inixiative/permissions';
import { type BuilderNode, buildRoot, type PickOption } from '../builder/buildNodes';
import { createView, describeScopeFields, viewRoot } from '../schema/surface';
import {
  type ActionPath,
  actionKind,
  addActionChild,
  childrenOfAction,
  defaultActionRule,
  removeActionNode,
  setActionNode,
} from './actionTree';
import type { ActionRule, ActionRuleKind, ListCheck } from './types';

const KIND_OPTIONS: PickOption[] = [
  { value: 'rule', label: 'rule (abac)' },
  { value: 'rel', label: 'rel (walk)' },
  { value: 'list', label: 'list (any item)' },
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
    case 'list':
      return { rel: '', arrayOperator: 'any', condition: { rule: { all: [] } } };
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
  /** permissions' issues at this node: what its gate refuses (`validateActionRule`: a negated
   *  condition, a match with no `exists`, a bare null check, a rule that delegates to itself), a
   *  read outside the lens it is judged in, a hop it cannot take
   *  (`validateActionRule`). */
  issues: ValidationIssue[];
};
/** A `rel` walk as a path of hops: one segment per relation crossed, each offering the hops
 *  permissions takes where the walk stands (`relationHopsFrom`: followed to-one relations and
 *  bridges). `target` is the final resource. */
export type RelControl = {
  segments: Control[];
  /** Relations available to append as the next hop (of the final resource). */
  addOptions: PickOption[];
  addSegment: (relation: string) => void;
  removeLast?: () => void;
  action: Control;
  target?: string;
};
/** A list arm: the declared list it crosses (`declaredListsOf`), and its condition, judged at an
 *  item in what the list's `down` paths load (`lensesAtListItem`). */
export type ListControl = { relation: Control; target?: string; condition?: ActionRuleNode };
export type ActionLeafNode = BaseNode & {
  delegate?: Control;
  rel?: RelControl;
  list?: ListControl;
  rule?: BuilderNode;
};
export type ActionGroupNode = BaseNode & { children: ActionRuleNode[]; addChild?: () => void };
export type ActionRuleNode = ActionLeafNode | ActionGroupNode;

export type BuildActionOptions = {
  /** permissions' schema map, the one `makeRebacCheck` takes: its field maps, bridges and rules. */
  map: SchemaMap;
  /** The resource the rule is on (`map:Model`, or a bridge's far end). */
  resource: string;
  /** The action the rule defines, never offered as its own delegate. */
  action?: string;
  maxDepth?: number;
  commit: (next: ActionRule) => void;
};

type Ctx = {
  map: SchemaMap;
  /** Where the node is judged: a row, or an item of a declared list. */
  at: LensesAtRow;
  action?: string;
  root: ActionRule;
  maxDepth: number;
  commit: (next: ActionRule) => void;
  issues: ValidationIssue[];
};

const actionsOf = (map: SchemaMap, resource: string): string[] =>
  Object.keys(map.permissions[resource]?.actions ?? {});

const opt = (v: string): PickOption => ({ value: v, label: v });

// permissions judges every `{ rule }` under json-rules' positive gate, a null check allowed
// beside an `exists` on its row's key (`permissions.idField`).
const ruleSurface = () => ({ positive: true, rowKey: engineGlobals.get('permissions.idField') });

const build = (
  node: ActionRule,
  path: ActionPath,
  issuePath: string,
  depth: number,
  ctx: Ctx,
): ActionRuleNode => {
  const kind = actionKind(node);
  // One list per walk: under an item no list arm is offered.
  const lists = kind === 'list' && !ctx.at.under ? declaredListsOf(ctx.map, ctx.at.resource) : [];
  const item =
    kind === 'list' && lists.includes((node as ListCheck).rel)
      ? lensesAtListItem(ctx.map, ctx.at.resource, (node as ListCheck).rel)
      : null;
  const condition =
    item && depth < ctx.maxDepth && (node as ListCheck).condition !== undefined
      ? `${issuePath}.condition`
      : undefined;
  // The paths a child node carries the issues of; everything else at or below this node is its own.
  const childPaths =
    kind === 'any' || kind === 'all'
      ? childrenOfAction(node).map((_, i) => `${issuePath}.${kind}[${i}]`)
      : condition
        ? [condition]
        : [];
  const under = (path: string, parent: string) => path === parent || path.startsWith(`${parent}.`);
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
    issues: ctx.issues.filter(
      (issue) =>
        under(issue.path, issuePath) && !childPaths.some((child) => under(issue.path, child)),
    ),
  };

  if (kind === 'any' || kind === 'all') {
    return {
      ...base,
      children: childrenOfAction(node).map((c, i) =>
        build(c, [...path, i], `${issuePath}.${kind}[${i}]`, depth + 1, ctx),
      ),
      addChild: depth < ctx.maxDepth ? () => ctx.commit(addActionChild(ctx.root, path)) : undefined,
    };
  }

  if (kind === 'delegate') {
    return {
      ...base,
      delegate: {
        value: node as string,
        options: actionsOf(ctx.map, ctx.at.resource)
          .filter((a) => ctx.at.under || a !== ctx.action)
          .map(opt),
        set: (a) => ctx.commit(setActionNode(ctx.root, path, a)),
      },
    };
  }

  if (kind === 'list') {
    const list = node as ListCheck;
    return {
      ...base,
      list: {
        relation: {
          value: list.rel,
          options: lists.map(opt),
          // A new list moves the item resource, so the condition starts over.
          set: (rel) =>
            ctx.commit(
              setActionNode(ctx.root, path, {
                rel,
                arrayOperator: 'any',
                condition: defaultActionRule(),
              }),
            ),
        },
        target: item?.resource,
        // A list arm saved with no condition has none to build: the gate's issue says so.
        condition:
          item && condition
            ? build(list.condition, [...path, 0], condition, depth + 1, { ...ctx, at: item })
            : undefined,
      },
    };
  }

  if (kind === 'rel') {
    const rel = node as { rel: string; action: string };
    const hopsAfter = (walked: string[]) => relationHopsFrom(ctx.map, ctx.at, walked.join('.'));
    // Editing the relation path can move the target resource, so the previously-picked action
    // (an action on the OLD target) no longer applies — reset it. Only `action.set` keeps it.
    const setRel = (next: string) =>
      ctx.commit(setActionNode(ctx.root, path, { rel: next, action: '' }));

    const segs = rel.rel ? rel.rel.split('.') : [];
    let target: string | undefined = ctx.at.resource;
    const segments: Control[] = segs.map((seg, i) => {
      // A hop past one permissions refuses stands nowhere: it offers nothing.
      const hops = target ? hopsAfter(segs.slice(0, i)) : [];
      target = hops.find((hop) => hop.segment === seg)?.resource;
      return {
        value: seg,
        options: hops.map((hop) => opt(hop.segment)),
        // Changing a hop truncates everything past it (deeper hops are scoped to it).
        set: (r) => setRel([...segs.slice(0, i), r].join('.')),
      };
    });

    return {
      ...base,
      rel: {
        segments,
        addOptions: target ? hopsAfter(segs).map((hop) => opt(hop.segment)) : [],
        addSegment: (r) => setRel([...segs, r].join('.')),
        removeLast: segs.length ? () => setRel(segs.slice(0, -1).join('.')) : undefined,
        action: {
          value: rel.action,
          options: (target ? actionsOf(ctx.map, target) : []).map(opt),
          set: (a) => ctx.commit(setActionNode(ctx.root, path, { rel: rel.rel, action: a })),
        },
        target,
      },
    };
  }

  if (kind === 'allow' || kind === 'deny') return base; // terminal true/false — kind picker only, no operands

  // rule (abac) — embed the condition builder; its commits fold back as { rule }.
  // A `{ rule }` is authored in the rule lens it is judged in: the row with the supplied maps.
  const cond = (node as { rule: Condition }).rule;
  if (!ctx.at.rule) return base;
  const view = createView(ctx.at.rule);
  const surfaceOpts = ruleSurface();
  return {
    ...base,
    rule: buildRoot(
      cond,
      view,
      describeScopeFields(viewRoot(view), surfaceOpts),
      ctx.maxDepth,
      (next) => ctx.commit(setActionNode(ctx.root, path, { rule: next })),
      { surfaceOpts },
    ),
  };
};

const gateIssues = (rule: ActionRule, opts: BuildActionOptions): ValidationIssue[] => {
  const result = validateActionRule(rule, {
    map: opts.map,
    resource: opts.resource,
    action: opts.action,
  });
  return result.ok ? [] : result.errors;
};

/**
 * The descriptor tree of a permissions action rule on `resource`, offering what permissions
 * accepts: `{ rule }` leaves in the rule lens (`lensesAtRow`), `{ rel }` hops from
 * `relationHopsFrom`, list arms over `declaredListsOf` with their condition at the item
 * (`lensesAtListItem`), and permissions' issues on the node they name. Pure.
 */
export const buildActionRoot = (rule: ActionRule, opts: BuildActionOptions): ActionRuleNode =>
  build(rule, [], '$', 0, {
    map: opts.map,
    at: lensesAtRow(opts.map, opts.resource),
    action: opts.action,
    root: rule,
    maxDepth: opts.maxDepth ?? 4,
    commit: opts.commit,
    issues: gateIssues(rule, opts),
  });
