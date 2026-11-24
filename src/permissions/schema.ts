import type { SchemaMap } from '@inixiative/permissions';
import type { ActionRule, ResourcePermission } from './types';

/** Every resource's action names, keyed by resource (`map:model`) — the awareness
 *  `useActionRuleBuilder` needs for `delegate` (same-resource) and `rel` (a target's actions). */
export const actionNamesByResource = (map: SchemaMap): Record<string, string[]> =>
  Object.fromEntries(
    (Object.entries(map.permissions) as [string, ResourcePermission | undefined][]).map(
      ([resource, mp]) => [resource, Object.keys(mp?.actions ?? {})],
    ),
  );

/** Immutably set one resource.action's rule, creating the resource entry if absent. */
export const setSchemaAction = (
  map: SchemaMap,
  resource: string,
  action: string,
  rule: ActionRule,
): SchemaMap => ({
  ...map,
  permissions: {
    ...map.permissions,
    [resource]: { actions: { ...(map.permissions[resource]?.actions ?? {}), [action]: rule } },
  },
});

/** Immutably drop one resource.action (and the resource entry if it becomes empty). */
export const removeSchemaAction = (map: SchemaMap, resource: string, action: string): SchemaMap => {
  const entry = map.permissions[resource];
  if (!entry) return map;
  const { [action]: _drop, ...actions } = entry.actions;
  const permissions = { ...map.permissions };
  if (Object.keys(actions).length === 0) delete permissions[resource];
  else permissions[resource] = { actions };
  return { ...map, permissions };
};
