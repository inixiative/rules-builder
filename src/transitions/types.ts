import type { Condition } from '@inixiative/json-rules';
import type { ActionRule } from '../permissions/types';

/**
 * The serializable transition primitives, matching `@inixiative/transitions`. Re-declared here so
 * the builder depends only on json-rules; the `permission` side reuses the permissions `ActionRule`.
 * The builder only authors *serializable* merges (a callback merge is not representable in a UI).
 */
export type MergeStrategy =
  | 'spread' // ≈ $set — shallow overwrite (default)
  | 'deepMerge' // ≈ $merge — recursive
  | { kind: 'append'; path: string } // ≈ $push — concat at path
  | { kind: 'appendUnique'; path: string }; // ≈ $addToSet — concat + dedupe at path

/** One half of a transition. `from.*` reads the current record, `to.*` the merged record. */
export type Side = {
  predicate: Condition; // json-rules — is this state shape legal?
  permission?: ActionRule; // authz against THIS side's record (absent = open)
};

export type ToSide = Side & { merge?: MergeStrategy };

/** An atomic edge: `from → to`. Disjunction lives at the action level, never here. */
export type Transition = { from: Side; to: ToSide };

/** A named verb: the OR of its edges, + affordance metadata. */
export type Action = { paths: Transition[]; label?: string };

/** `resource → action → Action` (resource is map-qualified, `db:Inquiry`). */
export type TransitionMap = Record<string, Record<string, Action>>;

export type SideKey = 'from' | 'to';
