// Schema surface — compose a lens from serializable maps and read field metadata.
export type { BuilderField, RuleBuilderSource, SurfaceOptions } from './schema';
export { composeSurface, describeModelFields, valueShapeForOperator } from './schema';

// Condition-tree engine — pure, immutable, path-addressed mutations + UI decoration.
export type { RulePath, RulePathSegment } from './core';
export {
  addRule,
  getNode,
  removeNode,
  setNode,
  stripMeta,
  switchGroupOperator,
  trimEmptyGroups,
  unwrapCompound,
  withIds,
  wrapInCompound,
} from './core';

// Component slot contracts — inject your own components (e.g. shadcn).
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
