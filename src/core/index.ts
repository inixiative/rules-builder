export { stripMeta, switchGroupOperator, trimEmptyGroups, withIds } from './decorate';
export type { RulePath, RulePathSegment } from './tree';
export {
  addRule,
  asGroupRoot,
  getNode,
  groupSiblings,
  normalizeGroups,
  removeNode,
  setNode,
  unwrapCompound,
  wrapInCompound,
} from './tree';
