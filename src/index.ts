export type { BuilderField, RuleBuilderSource, SurfaceOptions } from './schema';
export { composeSurface, describeModelFields, valueShapeForOperator } from './schema';

export type { RulePath, RulePathSegment } from './core';
export {
  addRule,
  getNode,
  groupSiblings,
  removeNode,
  setNode,
  stripMeta,
  switchGroupOperator,
  trimEmptyGroups,
  unwrapCompound,
  withIds,
  wrapInCompound,
} from './core';

export type {
  BaseInputProps,
  ButtonSlotProps,
  ComponentSlots,
  DatePickerSlotProps,
  ErrorMessageSlotProps,
  LabelSlotProps,
  MultiSelectSlotProps,
  NumberInputSlotProps,
  PartialComponentSlots,
  RuleBuilderContextValue,
  RuleBuilderProps,
  SelectSlotProps,
  SwitchSlotProps,
  TextInputSlotProps,
  UseRuleBuilder,
  UseRuleBuilderOptions,
  ValueModeToggleSlotProps,
  WrapperSlotProps,
} from './builder';
export {
  GroupFooter,
  GroupHeader,
  RuleBuilder,
  RuleBuilderContext,
  RuleGroup,
  RuleRow,
  useRuleBuilder,
  useRuleBuilderContext,
} from './builder';
