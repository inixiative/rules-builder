import type { Bridge, FieldMap } from '@inixiative/json-rules';
import { describeModelFields, resolve } from '../schema/surface';
import { defaultActionRule } from './actionTree';
import { type ActionRuleNode, buildActionRoot } from './buildActionRoot';
import { actionNamesByModel, removeSchemaAction, setSchemaAction } from './schema';
import type { ActionRule, RebacSchema } from './types';

export type UsePermissionBuilderOptions = {
  /** The whole rebac schema (model → { actions }). Controlled — edits flow out via onChange. */
  value: RebacSchema;
  onChange: (schema: RebacSchema) => void;
  /** The fieldMaps — each model's RAW record surface (full fields + relations) is built from these. */
  maps: Record<string, FieldMap>;
  /** Bridges, so `rel` walks can reach cross-map relations. */
  bridges?: Bridge[];
  maxDepth?: number;
};

/**
 * Schema-level permission builder: owns the entire rebac schema (in/out via value/onChange +
 * setSchema) across every model. A permission gates the RAW record, so each model's editing
 * surface is built straight from the fieldMaps (full fields/relations, no narrowing). Hands each
 * model.action's recursive ActionRule editor as a descriptor (`actionRoot`).
 */
export type UsePermissionBuilder = {
  value: RebacSchema;
  setSchema: (schema: RebacSchema) => void;
  /** Models that have a permission entry. */
  models: string[];
  /** Every model's action names — `delegate` / `rel` awareness. */
  actionsByModel: Record<string, string[]>;
  actionsOf: (model: string) => string[];
  addModel: (model: string) => void;
  removeModel: (model: string) => void;
  addAction: (model: string, action: string) => void;
  removeAction: (model: string, action: string) => void;
  setAction: (model: string, action: string, rule: ActionRule) => void;
  /** The descriptor tree for one model.action's rule (null if unknown / model not in the maps). */
  actionRoot: (model: string, action: string) => ActionRuleNode | null;
};

export const usePermissionBuilder = (opts: UsePermissionBuilderOptions): UsePermissionBuilder => {
  const { maps, bridges, maxDepth } = opts;
  const schema = opts.value;
  const setSchema = opts.onChange;
  const actionsByModel = actionNamesByModel(schema);

  const actionsOf = (model: string) => Object.keys(schema[model]?.actions ?? {});
  const mapNameOf = (model: string) => Object.keys(maps).find((mn) => maps[mn]?.models[model]);

  const setAction = (model: string, action: string, rule: ActionRule) =>
    setSchema(setSchemaAction(schema, model, action, rule));
  const addAction = (model: string, action: string) => {
    if (!action || schema[model]?.actions[action] !== undefined) return;
    setAction(model, action, defaultActionRule());
  };
  const removeAction = (model: string, action: string) => setSchema(removeSchemaAction(schema, model, action));

  const addModel = (model: string) => {
    if (schema[model] !== undefined) return;
    setSchema({ ...schema, [model]: { actions: {} } });
  };
  const removeModel = (model: string) => {
    const { [model]: _drop, ...rest } = schema;
    setSchema(rest);
  };

  const actionRoot = (model: string, action: string): ActionRuleNode | null => {
    const rule = schema[model]?.actions[action];
    if (rule === undefined) return null;
    const mapName = mapNameOf(model);
    if (!mapName) return null;
    const lens = resolve({ maps, bridges, mapName, model });
    const fields = describeModelFields(lens, mapName, model);
    return buildActionRoot(rule, {
      lens,
      fields,
      siblingActions: actionsOf(model).filter((a) => a !== action),
      actionsByModel,
      maxDepth,
      commit: (next) => setAction(model, action, next),
    });
  };

  return {
    value: schema,
    setSchema,
    models: Object.keys(schema),
    actionsByModel,
    actionsOf,
    addModel,
    removeModel,
    addAction,
    removeAction,
    setAction,
    actionRoot,
  };
};
