import type { ComponentSlots } from '../src/builder/slots';

const row: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  flexWrap: 'wrap',
};

export const exampleSlots: ComponentSlots = {
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
  Button: ({ children, onClick, variant, ...rest }) => (
    <button
      type="button"
      onClick={onClick}
      style={{ padding: '4px 10px', border: '1px solid #ccc', borderRadius: 6 }}
      {...rest}
    >
      {children}
    </button>
  ),
  IconButton: ({ children, onClick, ...rest }) => (
    <button type="button" onClick={onClick} style={{ border: 'none', background: 'none' }} {...rest}>
      {children}
    </button>
  ),
  RuleRow: ({ children }) => <div style={row}>{children}</div>,
  CompoundWrapper: ({ children }) => (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, display: 'grid', gap: 8 }}>
      {children}
    </div>
  ),
  NestedWrapper: ({ children }) => (
    <div
      style={{ border: '1px dashed #ccc', borderRadius: 8, padding: 12, marginLeft: 16, display: 'grid', gap: 8 }}
    >
      {children}
    </div>
  ),
  ErrorMessage: ({ message }) => <span style={{ color: '#c00' }}>{message}</span>,
  Label: ({ children, htmlFor }) => <label htmlFor={htmlFor}>{children}</label>,
  ValueModeToggle: ({ mode, onChange }) => (
    <button type="button" onClick={() => onChange(mode === 'value' ? 'field' : 'value')}>
      {mode === 'value' ? 'value' : 'field'}
    </button>
  ),
};
