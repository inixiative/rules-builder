import type { FC, ReactNode } from 'react';

/**
 * Base props shared by all input components.
 */
export type BaseInputProps = {
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
};

/**
 * Single-select dropdown.
 */
export type SelectSlotProps = BaseInputProps & {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

/**
 * Multi-select dropdown.
 */
export type MultiSelectSlotProps = BaseInputProps & {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
};

/**
 * Text input field.
 */
export type TextInputSlotProps = BaseInputProps & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

/**
 * Number input field.
 */
export type NumberInputSlotProps = BaseInputProps & {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
};

/**
 * Date picker input.
 */
export type DatePickerSlotProps = BaseInputProps & {
  value: Date | undefined;
  onChange: (value: Date | undefined) => void;
  placeholder?: string;
};

/**
 * Boolean switch/toggle.
 */
export type SwitchSlotProps = BaseInputProps & {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
};

/**
 * Button component.
 */
export type ButtonSlotProps = BaseInputProps & {
  onClick: () => void;
  children: ReactNode;
  variant?: 'default' | 'destructive' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
};

/**
 * Wrapper/container component.
 */
export type WrapperSlotProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Error message display.
 */
export type ErrorMessageSlotProps = {
  message: string;
};

/**
 * Label component.
 */
export type LabelSlotProps = {
  children: ReactNode;
  htmlFor?: string;
};

/**
 * Toggle between value mode and field reference mode.
 */
export type ValueModeToggleSlotProps = BaseInputProps & {
  mode: 'value' | 'field';
  onChange: (mode: 'value' | 'field') => void;
};

/**
 * All component slots that must be provided to the RuleBuilder.
 */
export type ComponentSlots = {
  // Value inputs (by field type)
  Select: FC<SelectSlotProps>;
  MultiSelect: FC<MultiSelectSlotProps>;
  TextInput: FC<TextInputSlotProps>;
  NumberInput: FC<NumberInputSlotProps>;
  DatePicker: FC<DatePickerSlotProps>;
  Switch: FC<SwitchSlotProps>;

  // Actions
  Button: FC<ButtonSlotProps>;
  IconButton: FC<ButtonSlotProps>;

  // Layout
  RuleRow: FC<WrapperSlotProps>;
  CompoundWrapper: FC<WrapperSlotProps>;
  NestedWrapper: FC<WrapperSlotProps>;

  // Feedback
  ErrorMessage: FC<ErrorMessageSlotProps>;
  Label: FC<LabelSlotProps>;

  // Special
  ValueModeToggle: FC<ValueModeToggleSlotProps>;
};

/**
 * Partial slots - allows providing only some components.
 */
export type PartialComponentSlots = Partial<ComponentSlots>;
