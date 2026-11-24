// `@inixiative/rules-builder/permissions`: the permission and transition builders, which read
// `@inixiative/permissions` at runtime (install it to use this entry). The main entry never does.

export type {
  Action,
  MergeStrategy,
  Side,
  SideKey,
  ToSide,
  Transition,
  TransitionMap,
  UseTransitionBuilder,
  UseTransitionBuilderOptions,
} from '../transitions';
export { emptyAction, useTransitionBuilder } from '../transitions';
export {
  type ActionPath,
  actionKind,
  addActionChild,
  childrenOfAction,
  defaultActionRule,
  getActionNode,
  isActionGroup,
  removeActionNode,
  setActionNode,
} from './actionTree';
export type {
  ActionGroupNode,
  ActionLeafNode,
  ActionRuleNode,
  BuildActionOptions,
} from './buildActionRoot';
export { buildActionRoot } from './buildActionRoot';
export { actionNamesByResource, removeSchemaAction, setSchemaAction } from './schema';
export type { ActionRule, ActionRuleKind, ResourcePermission } from './types';
export type { UseActionRuleBuilder, UseActionRuleBuilderOptions } from './useActionRuleBuilder';
export { useActionRuleBuilder } from './useActionRuleBuilder';
export type { UsePermissionBuilder, UsePermissionBuilderOptions } from './usePermissionBuilder';
export { usePermissionBuilder } from './usePermissionBuilder';
