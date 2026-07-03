import type { ActionRule, RebacSchema } from './types';

/** Every resource's action names, keyed by resource (`map:model`) — the awareness
 *  `useActionRuleBuilder` needs for `delegate` (same-resource) and `rel` (a target's actions). */
export const actionNamesByResource = (schema: RebacSchema): Record<string, string[]> =>
  Object.fromEntries(
    Object.entries(schema.permissions).map(([resource, mp]) => [
      resource,
      Object.keys(mp?.actions ?? {}),
    ]),
  );

/** Immutably set one resource.action's rule, creating the resource entry if absent. */
export const setSchemaAction = (
  schema: RebacSchema,
  resource: string,
  action: string,
  rule: ActionRule,
): RebacSchema => ({
  ...schema,
  permissions: {
    ...schema.permissions,
    [resource]: { actions: { ...(schema.permissions[resource]?.actions ?? {}), [action]: rule } },
  },
});

/** Immutably drop one resource.action (and the resource entry if it becomes empty). */
export const removeSchemaAction = (
  schema: RebacSchema,
  resource: string,
  action: string,
): RebacSchema => {
  const entry = schema.permissions[resource];
  if (!entry) return schema;
  const { [action]: _drop, ...actions } = entry.actions;
  const permissions = { ...schema.permissions };
  if (Object.keys(actions).length === 0) delete permissions[resource];
  else permissions[resource] = { actions };
  return { ...schema, permissions };
};
