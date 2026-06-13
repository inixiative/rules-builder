import type { ComponentSlots } from '../../src/builder/slots';

export const stubSlots: ComponentSlots = {
  Select: ({ options, value, onChange, ...rest }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
  MultiSelect: ({ options, value, onChange, ...rest }) => (
    <select
      multiple
      value={value}
      onChange={(e) => onChange(Array.from(e.target.selectedOptions, (o) => o.value))}
      {...rest}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
  TextInput: ({ value, onChange, ...rest }) => (
    <input value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
  ),
  NumberInput: ({ value, onChange, ...rest }) => (
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      {...rest}
    />
  ),
  DatePicker: ({ value, onChange, ...rest }) => (
    <input
      type="date"
      value={value ? value.toISOString().slice(0, 10) : ''}
      onChange={(e) => onChange(e.target.value ? new Date(e.target.value) : undefined)}
      {...rest}
    />
  ),
  Switch: ({ checked, onChange, ...rest }) => (
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} {...rest} />
  ),
  Button: ({ children, onClick, ...rest }) => (
    <button type="button" onClick={onClick} {...rest}>
      {children}
    </button>
  ),
  IconButton: ({ children, onClick, ...rest }) => (
    <button type="button" onClick={onClick} {...rest}>
      {children}
    </button>
  ),
  RuleRow: ({ children }) => <div data-testid="rule-row">{children}</div>,
  CompoundWrapper: ({ children }) => <div data-testid="group">{children}</div>,
  NestedWrapper: ({ children }) => <div data-testid="nested-group">{children}</div>,
  ErrorMessage: ({ message }) => <span role="alert">{message}</span>,
  Label: ({ children }) => <label>{children}</label>,
  ValueModeToggle: ({ mode, onChange }) => (
    <button type="button" onClick={() => onChange(mode === 'value' ? 'field' : 'value')}>
      {mode}
    </button>
  ),
};
