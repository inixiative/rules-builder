// Schema surface — derive builder field metadata from an exposedSurface lens.
export type { BuilderField, SurfaceOptions } from './schema';
export { describeModelFields, valueShapeForOperator } from './schema';

// Condition-tree engine — pure, immutable, path-addressed mutations.
export type { RulePath, RulePathSegment } from './core';
export {
  addRule,
  getNode,
  removeNode,
  setNode,
  unwrapCompound,
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
