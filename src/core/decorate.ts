import type { Condition } from '@inixiative/json-rules';

/**
 * UI-decoration layer over the pure `Condition` tree (see `tree.ts`). The builder
 * keeps stable ids on nodes so React can key them across inserts/removes without
 * remounting (`_groupId` on `all`/`any` compounds, `_id` on leaf rules), then
 * strips them with `stripMeta` before handing the rule to json-rules. This mirrors
 * the proven pattern in Zealot PR 1022's `treeOps.ts`; the canonical AST stays clean.
 */

type Rec = Record<string, unknown>;
const isObj = (c: unknown): c is Rec => typeof c === 'object' && c !== null;

const groupKey = (c: Rec): 'all' | 'any' | undefined =>
  Array.isArray(c.all) ? 'all' : Array.isArray(c.any) ? 'any' : undefined;

const groupChildren = (c: Rec, key: 'all' | 'any'): Condition[] => c[key] as Condition[];

/** Toggles an `all`/`any` compound to the other operator, preserving children and id. */
export const switchGroupOperator = (node: Condition, kind: 'all' | 'any'): Condition => {
  if (!isObj(node)) throw new Error('switchGroupOperator: not a compound');
  const rec = node as Rec;
  const key = groupKey(rec);
  if (!key) throw new Error('switchGroupOperator: node is not an all/any compound');
  const next: Rec = { [kind]: groupChildren(rec, key) };
  if (rec._groupId !== undefined) next._groupId = rec._groupId;
  if (rec.error !== undefined) next.error = rec.error;
  return next as Condition;
};

/** Recursively prunes empty `all`/`any` compounds. Returns `undefined` if the whole tree is empty. */
export const trimEmptyGroups = (node: Condition): Condition | undefined => {
  if (!isObj(node)) return node;
  const rec = node as Rec;
  const key = groupKey(rec);
  if (!key) return node;
  const kept = groupChildren(rec, key)
    .map(trimEmptyGroups)
    .filter((c): c is Condition => c !== undefined);
  if (kept.length === 0) return undefined;
  const next: Rec = { [key]: kept };
  if (rec._groupId !== undefined) next._groupId = rec._groupId;
  if (rec.error !== undefined) next.error = rec.error;
  return next as Condition;
};

/** Deep-removes builder metadata (`_id`/`_groupId`), yielding a clean json-rules `Condition`. */
export const stripMeta = (node: Condition): Condition => {
  if (!isObj(node)) return node;
  const out: Rec = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === '_id' || k === '_groupId') continue;
    out[k] = Array.isArray(v)
      ? v.map((x) => (isObj(x) ? stripMeta(x as Condition) : x))
      : isObj(v)
        ? stripMeta(v as Condition)
        : v;
  }
  return out as Condition;
};

const defaultMakeId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/**
 * Assigns stable ids to any nodes missing them (idempotent — existing ids are kept).
 * `makeId` is injectable for deterministic tests. Compounds get `_groupId`; leaves `_id`.
 */
export const withIds = (node: Condition, makeId: () => string = defaultMakeId): Condition => {
  if (!isObj(node)) return node;
  const rec = node as Rec;
  const key = groupKey(rec);
  if (key) {
    const next: Rec = { ...rec, [key]: groupChildren(rec, key).map((c) => withIds(c, makeId)) };
    if (next._groupId === undefined) next._groupId = makeId();
    return next as Condition;
  }
  const next: Rec = { ...rec };
  if (next._id === undefined) next._id = makeId();
  return next as Condition;
};
