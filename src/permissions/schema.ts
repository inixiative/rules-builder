import type { ActionRule, RebacSchema } from './types';

/** Every model's action names, keyed by model — the awareness `useActionRuleBuilder`
 *  needs for `delegate` (same-model actions) and `rel` (a target model's actions). */
export const actionNamesByModel = (schema: RebacSchema): Record<string, string[]> =>
  Object.fromEntries(Object.entries(schema).map(([model, mp]) => [model, Object.keys(mp?.actions ?? {})]));

/** Immutably set one model.action's rule, creating the model entry if absent. */
export const setSchemaAction = (
  schema: RebacSchema,
  model: string,
  action: string,
  rule: ActionRule,
): RebacSchema => ({
  ...schema,
  [model]: { actions: { ...(schema[model]?.actions ?? {}), [action]: rule } },
});

/** Immutably drop one model.action (and the model entry if it becomes empty). */
export const removeSchemaAction = (schema: RebacSchema, model: string, action: string): RebacSchema => {
  const entry = schema[model];
  if (!entry) return schema;
  const { [action]: _drop, ...actions } = entry.actions;
  if (Object.keys(actions).length === 0) {
    const { [model]: _m, ...rest } = schema;
    return rest;
  }
  return { ...schema, [model]: { actions } };
};
