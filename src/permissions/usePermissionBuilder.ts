import type { Bridge, FieldMap } from '@inixiative/json-rules';
import { type BuilderField, describeModelFields, resolve } from '../schema/surface';
import { defaultActionRule } from './actionTree';
import { type ActionRuleNode, buildActionRoot } from './buildActionRoot';
import { actionNamesByResource, removeSchemaAction, setSchemaAction } from './schema';
import type { ActionRule, RebacSchema } from './types';

const splitResource = (resource: string): [string, string] => {
  const i = resource.indexOf(':');
  return i === -1 ? ['', resource] : [resource.slice(0, i), resource.slice(i + 1)];
};

export type UsePermissionBuilderOptions = {
  /** The whole rebac schema ({ bridges, permissions }). Controlled — edits flow out via onChange. */
  value: RebacSchema;
  onChange: (schema: RebacSchema) => void;
  /** The fieldMaps — each resource's RAW record surface (full fields + relations) is built from these. */
  maps: Record<string, FieldMap>;
  /** Bridges, so `rel` walks can reach cross-map relations. */
  bridges?: Bridge[];
  maxDepth?: number;
};

/**
 * Schema-level permission builder: owns the entire rebac schema (in/out via value/onChange +
 * setSchema) across every resource (`map:model`). A permission gates the RAW record, so each
 * resource's editing surface is built straight from the fieldMaps. Hands each resource.action's
 * recursive ActionRule editor as a descriptor (`actionRoot`).
 */
export type UsePermissionBuilder = {
  value: RebacSchema;
  setSchema: (schema: RebacSchema) => void;
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
  /** The descriptor tree for one resource.action's rule (null if unknown / not in the maps). */
  actionRoot: (resource: string, action: string) => ActionRuleNode | null;
};

export const usePermissionBuilder = (opts: UsePermissionBuilderOptions): UsePermissionBuilder => {
  const { maps, bridges, maxDepth } = opts;
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

  const resourceFields = (res: string): BuilderField[] => {
    const [m, mdl] = splitResource(res);
    if (!maps[m]?.models[mdl]) return [];
    return describeModelFields(resolve({ maps, bridges, mapName: m, model: mdl }), m, mdl);
  };

  const actionRoot = (resource: string, action: string): ActionRuleNode | null => {
    const rule = schema.permissions[resource]?.actions[action];
    if (rule === undefined) return null;
    const [mapName, model] = splitResource(resource);
    if (!maps[mapName]?.models[model]) return null;
    const lens = resolve({ maps, bridges, mapName, model });
    const fields = describeModelFields(lens, mapName, model);
    return buildActionRoot(rule, {
      lens,
      fields,
      siblingActions: actionsOf(resource).filter((a) => a !== action),
      actionsByResource,
      resourceFields,
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
