import type { Action, SideKey, ToSide, Transition, TransitionMap } from './types';

export const emptyTransition = (): Transition => ({
  from: { predicate: { all: [] } },
  to: { predicate: { all: [] } },
});

/** A new action starts with a single empty edge. */
export const emptyAction = (): Action => ({ paths: [emptyTransition()] });

/** Every resource's action names, keyed by resource (`map:model`). */
export const actionNamesByResource = (schema: TransitionMap): Record<string, string[]> =>
  Object.fromEntries(Object.entries(schema).map(([r, actions]) => [r, Object.keys(actions ?? {})]));

export const setTransitionAction = (
  schema: TransitionMap,
  resource: string,
  action: string,
  value: Action,
): TransitionMap => ({
  ...schema,
  [resource]: { ...(schema[resource] ?? {}), [action]: value },
});

export const removeTransitionAction = (
  schema: TransitionMap,
  resource: string,
  action: string,
): TransitionMap => {
  const actions = schema[resource];
  if (!actions) return schema;
  const { [action]: _drop, ...rest } = actions;
  const next = { ...schema };
  if (Object.keys(rest).length === 0) delete next[resource];
  else next[resource] = rest;
  return next;
};

const mapAction = (
  schema: TransitionMap,
  resource: string,
  action: string,
  fn: (a: Action) => Action,
): TransitionMap => {
  const a = schema[resource]?.[action];
  if (!a) return schema;
  return setTransitionAction(schema, resource, action, fn(a));
};

export const addPath = (schema: TransitionMap, resource: string, action: string): TransitionMap =>
  mapAction(schema, resource, action, (a) => ({ ...a, paths: [...a.paths, emptyTransition()] }));

export const removePath = (
  schema: TransitionMap,
  resource: string,
  action: string,
  i: number,
): TransitionMap =>
  mapAction(schema, resource, action, (a) => ({ ...a, paths: a.paths.filter((_, n) => n !== i) }));

/** Immutably update one path's `from` or `to` side. */
export const updateSide = (
  schema: TransitionMap,
  resource: string,
  action: string,
  i: number,
  side: SideKey,
  fn: (s: ToSide) => ToSide,
): TransitionMap =>
  mapAction(schema, resource, action, (a) => ({
    ...a,
    paths: a.paths.map((p, n) => (n === i ? { ...p, [side]: fn(p[side] as ToSide) } : p)),
  }));
