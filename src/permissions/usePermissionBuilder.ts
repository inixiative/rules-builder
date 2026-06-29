import type { SourceValues } from '@inixiative/json-rules';
import { useMemo } from 'react';
import { describeModelFields, resolve, type RuleBuilderSource } from '../schema/surface';
import { defaultActionRule } from './actionTree';
import { type ActionRuleNode, buildActionRoot } from './buildActionRoot';
import { actionNamesByModel, removeSchemaAction, setSchemaAction } from './schema';
import type { ActionRule, RebacSchema } from './types';

export type UsePermissionBuilderOptions = {
  /** The whole permission schema (model → actions). Controlled — edits flow out via onChange. */
  value: RebacSchema;
  onChange: (schema: RebacSchema) => void;
  /** The lens/narrowing surface for the model currently being edited (its fields/relations). */
  source: RuleBuilderSource;
  sourceValues?: SourceValues[];
  maxDepth?: number;
};

/**
 * Schema-level permission builder. Holds the full rebac schema (in/out via `value`/`onChange`
 * + `setSchema`), edits the action rules of the model `source` anchors, and hands each action's
 * recursive `ActionRule` editor as a descriptor (`actionRoot`) — the model-aware atom underneath.
 */
export type UsePermissionBuilder = {
  value: RebacSchema;
  setSchema: (schema: RebacSchema) => void;
  /** The model being edited (the source's anchor). */
  model: string;
  /** Action names on this model. */
  actions: string[];
  /** Every model's action names — `delegate` / `rel` awareness. */
  actionsByModel: Record<string, string[]>;
  addAction: (name: string) => void;
  removeAction: (name: string) => void;
  setAction: (name: string, rule: ActionRule) => void;
  /** Drop the whole model entry from the schema. */
  removeModel: () => void;
  /** Build the descriptor tree for one action's rule (null if the action is unknown). */
  actionRoot: (action: string) => ActionRuleNode | null;
};

export const usePermissionBuilder = (opts: UsePermissionBuilderOptions): UsePermissionBuilder => {
  const lens = useMemo(
    () => resolve(opts.source, { sourceValues: opts.sourceValues }),
    [opts.source, opts.sourceValues],
  );
  const fields = useMemo(() => describeModelFields(lens, lens.mapName, lens.model), [lens]);

  const model = lens.model;
  const schema = opts.value;
  const setSchema = opts.onChange;
  const actions = Object.keys(schema[model]?.actions ?? {});
  const actionsByModel = actionNamesByModel(schema);

  const setAction = (name: string, rule: ActionRule) => setSchema(setSchemaAction(schema, model, name, rule));
  const addAction = (name: string) => {
    if (!name || schema[model]?.actions[name] !== undefined) return;
    setAction(name, defaultActionRule());
  };
  const removeAction = (name: string) => setSchema(removeSchemaAction(schema, model, name));
  const removeModel = () => {
    const { [model]: _drop, ...rest } = schema;
    setSchema(rest);
  };

  const actionRoot = (action: string): ActionRuleNode | null => {
    const rule = schema[model]?.actions[action];
    if (rule === undefined) return null;
    return buildActionRoot(rule, {
      lens,
      fields,
      siblingActions: actions.filter((a) => a !== action),
      actionsByModel,
      maxDepth: opts.maxDepth,
      commit: (next) => setAction(action, next),
    });
  };

  return {
    value: schema,
    setSchema,
    model,
    actions,
    actionsByModel,
    addAction,
    removeAction,
    setAction,
    removeModel,
    actionRoot,
  };
};
