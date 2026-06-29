import type { Condition } from '@inixiative/json-rules';

/**
 * The serializable permission algebra (rebac/abac/rbac). Declared here so the builder
 * depends only on json-rules — structurally identical to `@inixiative/permissions`'
 * `ActionRule` (and the copy `@inixiative/transitions` re-declares).
 */
export type ActionRule =
  | string // delegate to another action on the same model
  | { rel: string; action: string } // walk a relation, then check `action` on the target
  | { self: string } // record[field] === actor.id
  | { rule: Condition } // ABAC predicate (json-rules) over the record
  | { any: ActionRule[] } // OR
  | { all: ActionRule[] } // AND
  | null; // terminal deny

/** One model's permission entry: `actions: { name → ActionRule }`. */
export type ModelPermission = { actions: Record<string, ActionRule> };

/** The full permission schema: `model → ModelPermission`. */
export type RebacSchema = Record<string, ModelPermission>;

export type ActionRuleKind = 'delegate' | 'rel' | 'self' | 'rule' | 'any' | 'all' | 'deny';
