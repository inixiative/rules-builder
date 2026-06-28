import type { CSSProperties, ReactNode } from 'react';

export const tokens = {
  border: '#e2e2e6',
  borderStrong: '#cfcfd6',
  bg: '#ffffff',
  bgMuted: '#f6f6f8',
  bgCode: '#f4f4f6',
  text: '#1c1c22',
  textMuted: '#6b6b75',
  accent: '#3b5bdb',
  accentBg: '#edf0fe',
  danger: '#c0392b',
  ok: '#2b8a3e',
  radius: 8,
};

export const Panel = ({
  title,
  actions,
  children,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) => (
  <section
    style={{
      border: `1px solid ${tokens.border}`,
      borderRadius: tokens.radius,
      background: tokens.bg,
      display: 'grid',
      gap: 12,
      padding: 16,
    }}
  >
    {(title || actions) && (
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {title ? <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{title}</h2> : <span />}
        {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
      </header>
    )}
    {children}
  </section>
);

export const Row = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', ...style }}>
    {children}
  </div>
);

/** The single-select element used everywhere — no more radio-vs-dropdown drift. */
export const Select = ({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  style,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  style?: CSSProperties;
  ariaLabel?: string;
}) => (
  <select
    aria-label={ariaLabel}
    value={value}
    disabled={disabled}
    onChange={(e) => onChange(e.target.value)}
    style={{
      padding: '5px 8px',
      borderRadius: 6,
      border: `1px solid ${tokens.borderStrong}`,
      fontSize: 13,
      background: tokens.bg,
      color: tokens.text,
      ...style,
    }}
  >
    {placeholder !== undefined && (
      <option value="" disabled>
        {placeholder}
      </option>
    )}
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

export const Button = ({
  children,
  onClick,
  variant = 'default',
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  title?: string;
}) => {
  const styles: Record<string, CSSProperties> = {
    default: { background: tokens.bg, color: tokens.text, border: `1px solid ${tokens.borderStrong}` },
    primary: { background: tokens.accent, color: '#fff', border: `1px solid ${tokens.accent}` },
    ghost: { background: 'transparent', color: tokens.textMuted, border: '1px solid transparent' },
    danger: { background: tokens.bg, color: tokens.danger, border: `1px solid ${tokens.danger}` },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        ...styles[variant],
        padding: '5px 11px',
        borderRadius: 6,
        fontSize: 13,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
};

export const Code = ({ children }: { children: ReactNode }) => (
  <pre
    style={{
      background: tokens.bgCode,
      padding: 12,
      borderRadius: tokens.radius,
      fontSize: 12,
      margin: 0,
      overflow: 'auto',
      maxHeight: 360,
      lineHeight: 1.5,
    }}
  >
    {children}
  </pre>
);

export const Badge = ({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'ok' | 'danger' | 'accent';
}) => {
  const colors: Record<string, [string, string]> = {
    muted: [tokens.bgMuted, tokens.textMuted],
    ok: ['#e6f4ea', tokens.ok],
    danger: ['#fdecea', tokens.danger],
    accent: [tokens.accentBg, tokens.accent],
  };
  const [bg, fg] = colors[tone];
  return (
    <span
      style={{
        background: bg,
        color: fg,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
};

export const Empty = ({ children }: { children: ReactNode }) => (
  <p style={{ color: tokens.textMuted, fontSize: 13, margin: 0 }}>{children}</p>
);
