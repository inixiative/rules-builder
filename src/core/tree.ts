import type { Condition } from '@inixiative/json-rules';

export type RulePathSegment = number | 'if' | 'then' | 'else' | 'condition';
export type RulePath = RulePathSegment[];

type CondObject = Exclude<Condition, boolean>;
type AllNode = { all: Condition[] };
type AnyNode = { any: Condition[] };

const isObj = (c: Condition): c is CondObject => typeof c === 'object' && c !== null;
const isAll = (c: Condition): c is AllNode => isObj(c) && 'all' in c && Array.isArray(c.all);
const isAny = (c: Condition): c is AnyNode => isObj(c) && 'any' in c && Array.isArray(c.any);

const childArray = (c: Condition): Condition[] | undefined =>
  isAll(c) ? c.all : isAny(c) ? c.any : undefined;

const withChildArray = (c: AllNode | AnyNode, next: Condition[]): Condition =>
  isAll(c) ? { ...c, all: next } : { ...(c as AnyNode), any: next };

export const getNode = (cond: Condition, path: RulePath): Condition | undefined => {
  let cur: Condition | undefined = cond;
  for (const seg of path) {
    if (cur === undefined || !isObj(cur)) return undefined;
    if (typeof seg === 'number') {
      const arr = childArray(cur);
      cur = arr?.[seg];
    } else {
      cur = (cur as unknown as Record<string, Condition | undefined>)[seg];
    }
  }
  return cur;
};

export const setNode = (cond: Condition, path: RulePath, node: Condition): Condition => {
  if (path.length === 0) return node;
  const [seg, ...rest] = path;
  if (!isObj(cond)) throw new Error(`setNode: path segment '${seg}' has no object to descend into`);

  if (typeof seg === 'number') {
    const arr = childArray(cond);
    if (!arr) throw new Error(`setNode: numeric segment ${seg} but node is not all/any`);
    const next = arr.slice();
    next[seg] = setNode(arr[seg] as Condition, rest, node);
    return withChildArray(cond as AllNode | AnyNode, next);
  }
  const record = cond as unknown as Record<string, Condition | undefined>;
  return { ...record, [seg]: setNode(record[seg] as Condition, rest, node) } as unknown as Condition;
};

export const removeNode = (cond: Condition, path: RulePath): Condition => {
  if (path.length === 0) throw new Error('removeNode: cannot remove the root');
  const parentPath = path.slice(0, -1);
  const key = path[path.length - 1];
  const parent = getNode(cond, parentPath);
  if (parent === undefined || !isObj(parent)) throw new Error('removeNode: parent path does not resolve');

  if (typeof key === 'number') {
    const arr = childArray(parent);
    if (!arr) throw new Error('removeNode: parent is not all/any');
    return setNode(cond, parentPath, withChildArray(parent as AllNode | AnyNode, arr.filter((_, i) => i !== key)));
  }
  if (key === 'else') {
    const { else: _omit, ...rest } = parent as unknown as Record<string, unknown>;
    return setNode(cond, parentPath, rest as unknown as Condition);
  }
  throw new Error(`removeNode: segment '${key}' is required and cannot be removed`);
};

export const addRule = (cond: Condition, parentPath: RulePath, node: Condition): Condition => {
  const parent = getNode(cond, parentPath);
  if (parent === undefined || (!isAll(parent) && !isAny(parent))) {
    throw new Error('addRule: parent must be an all/any compound');
  }
  const arr = childArray(parent) as Condition[];
  return setNode(cond, parentPath, withChildArray(parent, [...arr, node]));
};

export const wrapInCompound = (cond: Condition, path: RulePath, kind: 'all' | 'any'): Condition => {
  const node = getNode(cond, path);
  if (node === undefined) throw new Error('wrapInCompound: path does not resolve');
  const wrapped: Condition = kind === 'all' ? { all: [node] } : { any: [node] };
  return setNode(cond, path, wrapped);
};

// Groups selected siblings of an all/any compound into a new subgroup at the
// position of the earliest selected index (push a subset down a layer).
export const groupSiblings = (
  cond: Condition,
  parentPath: RulePath,
  indices: number[],
  kind: 'all' | 'any',
): Condition => {
  const parent = getNode(cond, parentPath);
  if (parent === undefined || (!isAll(parent) && !isAny(parent))) {
    throw new Error('groupSiblings: parent must be an all/any compound');
  }
  const arr = childArray(parent) as Condition[];
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  if (sorted.length === 0) throw new Error('groupSiblings: no indices selected');
  if (sorted.some((i) => i < 0 || i >= arr.length)) throw new Error('groupSiblings: index out of range');

  const selected = new Set(sorted);
  const group: Condition = kind === 'all' ? { all: sorted.map((i) => arr[i] as Condition) } : { any: sorted.map((i) => arr[i] as Condition) };
  const next: Condition[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i === sorted[0]) next.push(group);
    if (!selected.has(i)) next.push(arr[i] as Condition);
  }
  return setNode(cond, parentPath, withChildArray(parent as AllNode | AnyNode, next));
};

// Dissolves a compound into its parent: splices its children up a layer when the
// parent is an all/any (any child count); otherwise requires a single child.
export const unwrapCompound = (cond: Condition, path: RulePath): Condition => {
  const node = getNode(cond, path);
  if (node === undefined) throw new Error('unwrapCompound: path does not resolve');
  const children = childArray(node);
  if (!children) throw new Error('unwrapCompound: node is not an all/any compound');

  if (path.length === 0) {
    if (children.length !== 1) throw new Error('unwrapCompound: cannot dissolve a multi-child root');
    return children[0] as Condition;
  }

  const parentPath = path.slice(0, -1);
  const key = path[path.length - 1];
  const parent = getNode(cond, parentPath);
  if (typeof key === 'number' && parent !== undefined && (isAll(parent) || isAny(parent))) {
    const arr = childArray(parent) as Condition[];
    const next = [...arr.slice(0, key), ...children, ...arr.slice(key + 1)];
    return setNode(cond, parentPath, withChildArray(parent as AllNode | AnyNode, next));
  }
  if (children.length !== 1) {
    throw new Error('unwrapCompound: a single-slot parent can only take a single-child compound');
  }
  return setNode(cond, path, children[0] as Condition);
};
