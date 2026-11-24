import type { SchemaMap } from '@inixiative/permissions';
import type { ActionRule, ResourcePermission } from './types';

/** Every resource's action names, keyed by resource (`map:model`) — the awareness
 *  `useActionRuleBuilder` needs for `delegate` (same-resource) and `rel` (a target's actions). */
export const actionNamesByResource = (schemaMap: SchemaMap): Record<string, string[]> =>
  Object.fromEntries(
    (Object.entries(schemaMap.permissions) as [string, ResourcePermission | undefined][]).map(
      ([resource, mp]) => [resource, Object.keys(mp?.actions ?? {})],
    ),
  );

/** Immutably set one resource.action's rule, creating the resource entry if absent. */
export const setSchemaAction = (
  schemaMap: SchemaMap,
  resource: string,
  action: string,
  rule: ActionRule,
): SchemaMap => ({
  ...schemaMap,
  permissions: {
    ...schemaMap.permissions,
    [resource]: {
      actions: { ...(schemaMap.permissions[resource]?.actions ?? {}), [action]: rule },
    },
  },
});

/** Immutably drop one resource.action (and the resource entry if it becomes empty). */
export const removeSchemaAction = (
  schemaMap: SchemaMap,
  resource: string,
  action: string,
): SchemaMap => {
  const entry = schemaMap.permissions[resource];
  if (!entry) return schemaMap;
  const { [action]: _drop, ...actions } = entry.actions;
  const permissions = { ...schemaMap.permissions };
  if (Object.keys(actions).length === 0) delete permissions[resource];
  else permissions[resource] = { actions };
  return { ...schemaMap, permissions };
};
