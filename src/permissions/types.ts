import type { Bridge, Condition } from '@inixiative/json-rules';

/**
 * The serializable permission algebra (rebac/abac/rbac). Declared here so the builder
 * depends only on json-rules — structurally identical to `@inixiative/permissions`'
 * `ActionRule` (and the copy `@inixiative/transitions` re-declares).
 */
export type ActionRule =
  | string // delegate to another action on the same resource
  | { rel: string; action: string } // walk a relation, then check `action` on the target
  | { self: string } // record[field] === actor.id
  | { rule: Condition } // ABAC predicate (json-rules) over the record
  | { any: ActionRule[] } // OR
  | { all: ActionRule[] } // AND
  | boolean // terminal allow (true) / deny (false)
  | null; // terminal deny (equivalent to false)

/** One resource's permission entry: `actions: { name → ActionRule }`. */
export type ResourcePermission = { actions: Record<string, ActionRule> };

/**
 * The full permission schema, matching `@inixiative/permissions@0.2.0`: `permissions` maps a
 * map-qualified resource (`app:User`) to its actions; `bridges` are the cross-source edges a `rel`
 * walk may cross — carried so the schema is self-contained for the check engine.
 */
export type RebacSchema = {
  bridges?: Bridge[];
  permissions: Record<string, ResourcePermission>;
};

export type ActionRuleKind = 'delegate' | 'rel' | 'self' | 'rule' | 'any' | 'all' | 'allow' | 'deny';
