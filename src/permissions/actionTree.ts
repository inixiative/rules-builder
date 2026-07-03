import type { ActionRule, ActionRuleKind } from './types';

export type ActionPath = number[];

const isObj = (r: ActionRule): r is Exclude<ActionRule, string | boolean | null> =>
  typeof r === 'object' && r !== null;

export const actionKind = (rule: ActionRule): ActionRuleKind => {
  if (rule === null || rule === false) return 'deny';
  if (rule === true) return 'allow';
  if (typeof rule === 'string') return 'delegate';
  if ('any' in rule) return 'any';
  if ('all' in rule) return 'all';
  if ('rel' in rule) return 'rel';
  if ('self' in rule) return 'self';
  return 'rule';
};

export const isActionGroup = (rule: ActionRule): boolean => {
  const k = actionKind(rule);
  return k === 'any' || k === 'all';
};

export const childrenOfAction = (rule: ActionRule): ActionRule[] => {
  if (!isObj(rule)) return [];
  if ('any' in rule) return rule.any;
  if ('all' in rule) return rule.all;
  return [];
};

const withChildren = (rule: ActionRule, next: ActionRule[]): ActionRule => {
  if (isObj(rule) && 'any' in rule) return { any: next };
  if (isObj(rule) && 'all' in rule) return { all: next };
  throw new Error('withChildren: not an any/all group');
};

/** The default leaf when a slot is created — an empty ABAC predicate, ready to author. */
export const defaultActionRule = (): ActionRule => ({ rule: { all: [] } });

export const getActionNode = (rule: ActionRule, path: ActionPath): ActionRule | undefined => {
  let cur: ActionRule | undefined = rule;
  for (const i of path) {
    if (cur === undefined) return undefined;
    cur = childrenOfAction(cur)[i];
  }
  return cur;
};

export const setActionNode = (rule: ActionRule, path: ActionPath, next: ActionRule): ActionRule => {
  if (path.length === 0) return next;
  const [i, ...rest] = path;
  const kids = childrenOfAction(rule).slice();
  kids[i] = setActionNode(kids[i] as ActionRule, rest, next);
  return withChildren(rule, kids);
};

export const addActionChild = (rule: ActionRule, path: ActionPath): ActionRule => {
  const group = getActionNode(rule, path);
  if (group === undefined || !isActionGroup(group))
    throw new Error('addActionChild: target is not a group');
  return setActionNode(
    rule,
    path,
    withChildren(group, [...childrenOfAction(group), defaultActionRule()]),
  );
};

export const removeActionNode = (rule: ActionRule, path: ActionPath): ActionRule => {
  if (path.length === 0) throw new Error('removeActionNode: cannot remove the root');
  const parentPath = path.slice(0, -1);
  const i = path[path.length - 1];
  const parent = getActionNode(rule, parentPath);
  if (parent === undefined || !isActionGroup(parent))
    throw new Error('removeActionNode: parent is not a group');
  return setActionNode(
    rule,
    parentPath,
    withChildren(
      parent,
      childrenOfAction(parent).filter((_, n) => n !== i),
    ),
  );
};
