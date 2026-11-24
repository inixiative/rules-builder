// The permission algebra is `@inixiative/permissions`' own; the builder imports its types and
// never re-declares them.
export type {
  ActionRule,
  ListCheck,
  RelationCheck,
  ResourcePermission,
  RuleCheck,
} from '@inixiative/permissions';

/** The editor's name for each arm of an `ActionRule`. */
export type ActionRuleKind =
  | 'delegate'
  | 'rel'
  | 'list'
  | 'rule'
  | 'any'
  | 'all'
  | 'allow'
  | 'deny';
