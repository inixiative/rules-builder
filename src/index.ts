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
  SelectSlotProps,
  SwitchSlotProps,
  TextInputSlotProps,
  ValueModeToggleSlotProps,
  WrapperSlotProps,
} from './builder';
