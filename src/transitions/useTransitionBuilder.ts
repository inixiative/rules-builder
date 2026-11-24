import type { Lens, LensNarrowing } from '@inixiative/json-rules';
import type { SchemaMap } from '@inixiative/permissions';
import { type BuilderNode, buildRoot } from '../builder/buildNodes';
import { defaultActionRule } from '../permissions/actionTree';
import { type ActionRuleNode, buildActionRoot } from '../permissions/buildActionRoot';
import { modelOfResource } from '../permissions/modelOfResource';
import { createView, describeScopeFields, rawView, viewRoot } from '../schema/surface';
import {
  addPath as addPathOp,
  emptyAction,
  removePath as removePathOp,
  removeTransitionAction,
  setTransitionAction,
  updateSide,
} from './transitionTree';
import type { MergeStrategy, SideKey, TransitionMap } from './types';

export type UseTransitionBuilderOptions = {
  /** The whole transition schema (resource → action → Action). Controlled — edits flow via onChange. */
  value: TransitionMap;
  onChange: (schema: TransitionMap) => void;
  /** permissions' schema map: a side's `permission` is authored in the lens permissions judges it
   *  in and delegates into its rules, and a predicate is on the record's model. */
  map: SchemaMap;
  /** The lens a resource's predicates are judged in, as transitions' `validateTransition({ lens })`
   *  takes; absent, the raw record (every column and relation). */
  predicateLens?: (resource: string) => Lens | LensNarrowing | undefined;
  maxDepth?: number;
};

/**
 * Schema-level transition builder. Owns the whole TransitionMap; hands each edge's `from`/`to`
 * predicate as a json-rules descriptor (`predicateRoot`, via buildRoot) and each side's optional
 * authz `permission` as an ActionRule descriptor (`permissionRoot`, via buildActionRoot). Surfaces
 * are permissions' own lenses for a `permission` and the record (or `predicateLens`) for a
 * predicate; `to.merge` is a serializable strategy.
 */
export type UseTransitionBuilder = {
  value: TransitionMap;
  setSchema: (s: TransitionMap) => void;
  resources: string[];
  actionsOf: (resource: string) => string[];
  addResource: (resource: string) => void;
  removeResource: (resource: string) => void;
  addAction: (resource: string, action: string) => void;
  removeAction: (resource: string, action: string) => void;
  pathCount: (resource: string, action: string) => number;
  addPath: (resource: string, action: string) => void;
  removePath: (resource: string, action: string, i: number) => void;
  predicateRoot: (resource: string, action: string, i: number, side: SideKey) => BuilderNode | null;
  permissionHas: (resource: string, action: string, i: number, side: SideKey) => boolean;
  enablePermission: (resource: string, action: string, i: number, side: SideKey) => void;
  clearPermission: (resource: string, action: string, i: number, side: SideKey) => void;
  permissionRoot: (
    resource: string,
    action: string,
    i: number,
    side: SideKey,
  ) => ActionRuleNode | null;
  mergeOf: (resource: string, action: string, i: number) => MergeStrategy | undefined;
  setMerge: (resource: string, action: string, i: number, merge: MergeStrategy | undefined) => void;
};

export const useTransitionBuilder = (opts: UseTransitionBuilderOptions): UseTransitionBuilder => {
  const { map, maxDepth } = opts;
  const schema = opts.value;
  const setSchema = opts.onChange;

  const actionsOf = (resource: string) => Object.keys(schema[resource] ?? {});
  const sideOf = (resource: string, action: string, i: number, side: SideKey) =>
    schema[resource]?.[action]?.paths[i]?.[side];

  const surface = (resource: string) => {
    const named = modelOfResource(map, resource);
    if (!named) return null;
    const lens = opts.predicateLens?.(resource);
    const view = lens
      ? createView(lens)
      : rawView({ maps: map.maps, mapName: named.mapName, model: named.modelName });
    return { view, fields: describeScopeFields(viewRoot(view)) };
  };

  const addResource = (resource: string) => {
    if (schema[resource] !== undefined) return;
    setSchema({ ...schema, [resource]: {} });
  };
  const removeResource = (resource: string) => {
    const { [resource]: _drop, ...rest } = schema;
    setSchema(rest);
  };
  const addAction = (resource: string, action: string) => {
    if (!action || schema[resource]?.[action] !== undefined) return;
    setSchema(setTransitionAction(schema, resource, action, emptyAction()));
  };
  const removeAction = (resource: string, action: string) =>
    setSchema(removeTransitionAction(schema, resource, action));

  const predicateRoot = (
    resource: string,
    action: string,
    i: number,
    side: SideKey,
  ): BuilderNode | null => {
    const sideObj = sideOf(resource, action, i, side);
    const s = surface(resource);
    if (!sideObj || !s) return null;
    return buildRoot(sideObj.predicate, s.view, s.fields, maxDepth ?? 4, (next) =>
      setSchema(
        updateSide(schema, resource, action, i, side, (sd) => ({ ...sd, predicate: next })),
      ),
    );
  };

  const permissionRoot = (
    resource: string,
    action: string,
    i: number,
    side: SideKey,
  ): ActionRuleNode | null => {
    const sideObj = sideOf(resource, action, i, side);
    if (!sideObj || sideObj.permission === undefined) return null;
    return buildActionRoot(sideObj.permission, {
      map,
      resource,
      maxDepth,
      commit: (next) =>
        setSchema(
          updateSide(schema, resource, action, i, side, (sd) => ({ ...sd, permission: next })),
        ),
    });
  };

  return {
    value: schema,
    setSchema,
    resources: Object.keys(schema),
    actionsOf,
    addResource,
    removeResource,
    addAction,
    removeAction,
    pathCount: (resource, action) => schema[resource]?.[action]?.paths.length ?? 0,
    addPath: (resource, action) => setSchema(addPathOp(schema, resource, action)),
    removePath: (resource, action, i) => setSchema(removePathOp(schema, resource, action, i)),
    predicateRoot,
    permissionHas: (resource, action, i, side) =>
      sideOf(resource, action, i, side)?.permission !== undefined,
    enablePermission: (resource, action, i, side) =>
      setSchema(
        updateSide(schema, resource, action, i, side, (sd) => ({
          ...sd,
          permission: defaultActionRule(),
        })),
      ),
    clearPermission: (resource, action, i, side) =>
      setSchema(
        updateSide(schema, resource, action, i, side, (sd) => {
          const { permission: _drop, ...rest } = sd;
          return rest;
        }),
      ),
    permissionRoot,
    mergeOf: (resource, action, i) => schema[resource]?.[action]?.paths[i]?.to.merge,
    setMerge: (resource, action, i, merge) =>
      setSchema(
        updateSide(schema, resource, action, i, 'to', (sd) => {
          if (merge === undefined) {
            const { merge: _drop, ...rest } = sd;
            return rest;
          }
          return { ...sd, merge };
        }),
      ),
  };
};
