import { endpointKey } from '@inixiative/json-rules';
import type { SchemaMap } from '@inixiative/permissions';
import { defaultActionRule } from './actionTree';
import { type ActionRuleNode, buildActionRoot } from './buildActionRoot';
import { modelOfResource } from './modelOfResource';
import { actionNamesByResource, removeSchemaAction, setSchemaAction } from './schema';
import type { ActionRule } from './types';

export type UsePermissionBuilderOptions = {
  /** permissions' schema map, the one `makeRebacCheck` takes; its rules (`permissions`) are
   *  what is edited, and every rule is authored in the lens permissions judges it in.
   *  Controlled: edits flow out via onChange. */
  value: SchemaMap;
  onChange: (map: SchemaMap) => void;
  maxDepth?: number;
};

/**
 * Schema-level permission builder: owns the rules of a schema map (in/out via value/onChange +
 * setSchema) across every resource (`map:model`). A permission gates the RAW record, so each
 * resource's editing surface is built straight from the fieldMaps. Hands each resource.action's
 * recursive ActionRule editor as a descriptor (`actionRoot`).
 */
export type UsePermissionBuilder = {
  value: SchemaMap;
  setSchema: (map: SchemaMap) => void;
  /** Resources (`map:model`) with a permission entry. */
  resources: string[];
  /** Every resource's action names — `delegate` / `rel` awareness. */
  actionsByResource: Record<string, string[]>;
  actionsOf: (resource: string) => string[];
  addResource: (resource: string) => void;
  removeResource: (resource: string) => void;
  addAction: (resource: string, action: string) => void;
  removeAction: (resource: string, action: string) => void;
  setAction: (resource: string, action: string, rule: ActionRule) => void;
  /** The descriptor tree for one resource.action's rule (null when the action is not in the schema,
   *  or the resource is neither in the map nor a bridge's far end). */
  actionRoot: (resource: string, action: string) => ActionRuleNode | null;
};

export const usePermissionBuilder = (opts: UsePermissionBuilderOptions): UsePermissionBuilder => {
  const { maxDepth } = opts;
  const schema = opts.value;
  const setSchema = opts.onChange;
  const actionsByResource = actionNamesByResource(schema);

  const actionsOf = (resource: string) => Object.keys(schema.permissions[resource]?.actions ?? {});

  const setAction = (resource: string, action: string, rule: ActionRule) =>
    setSchema(setSchemaAction(schema, resource, action, rule));
  const addAction = (resource: string, action: string) => {
    if (!action || schema.permissions[resource]?.actions[action] !== undefined) return;
    setAction(resource, action, defaultActionRule());
  };
  const removeAction = (resource: string, action: string) =>
    setSchema(removeSchemaAction(schema, resource, action));

  const addResource = (resource: string) => {
    if (schema.permissions[resource] !== undefined) return;
    setSchema({ ...schema, permissions: { ...schema.permissions, [resource]: { actions: {} } } });
  };
  const removeResource = (resource: string) => {
    const { [resource]: _drop, ...rest } = schema.permissions;
    setSchema({ ...schema, permissions: rest });
  };

  // As permissions' `validateSchema`: a resource is in the map, or a bridge's far end.
  const resourceInMap = (resource: string) =>
    modelOfResource(schema, resource) !== null ||
    (schema.bridges ?? []).some((bridge) =>
      bridge.endpoints.some((end) => endpointKey(end) === resource),
    );

  const actionRoot = (resource: string, action: string): ActionRuleNode | null => {
    const rule = schema.permissions[resource]?.actions[action];
    if (rule === undefined || !resourceInMap(resource)) return null;
    return buildActionRoot(rule, {
      map: schema,
      resource,
      action,
      maxDepth,
      commit: (next) => setAction(resource, action, next),
    });
  };

  return {
    value: schema,
    setSchema,
    resources: Object.keys(schema.permissions),
    actionsByResource,
    actionsOf,
    addResource,
    removeResource,
    addAction,
    removeAction,
    setAction,
    actionRoot,
  };
};
