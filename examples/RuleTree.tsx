import { useState } from 'react';
import {
  type BuilderNode,
  type GroupNode,
  type LeafNode,
  type RuleBuilderSource,
  useRuleBuilder,
  type ValueControl,
} from '../src';

/**
 * Reference renderer for the headless rule builder. Copy this file, swap the
 * plain elements for your design-system components, and style it. The lib hands
 * you `root` (what controls exist at each level + bound actions); everything here
 * is display — collapse, layout, inputs — and entirely yours to change.
 */

const sel: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: 13,
};
const row: React.CSSProperties = { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' };

const Picker = ({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value?: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) => (
  <select aria-label={ariaLabel} style={sel} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
    <option value="" disabled>
      {ariaLabel}…
    </option>
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

const ValueField = ({ value }: { value: ValueControl }) => {
  if (value.shape === 'none') return null;
  if (value.options) {
    const multi = value.shape === 'array' || value.shape === 'dayList';
    if (multi) {
      const current = Array.isArray(value.current) ? (value.current as string[]) : [];
      return (
        <select
          aria-label="value"
          multiple
          style={sel}
          value={current}
          onChange={(e) => value.set(Array.from(e.target.selectedOptions, (o) => o.value))}
        >
          {value.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    return <Picker ariaLabel="value" value={value.current == null ? '' : String(value.current)} options={value.options} onChange={value.set} />;
  }
  if (value.kind === 'Boolean') {
    return (
      <Picker
        ariaLabel="value"
        value={value.current === true ? 'true' : value.current === false ? 'false' : ''}
        options={[
          { value: 'true', label: 'true' },
          { value: 'false', label: 'false' },
        ]}
        onChange={(v) => value.set(v === 'true')}
      />
    );
  }
  if (value.kind === 'DateTime') {
    return (
      <input
        aria-label="value"
        type="date"
        style={sel}
        value={typeof value.current === 'string' ? value.current.slice(0, 10) : ''}
        onChange={(e) => value.set(e.target.value)}
      />
    );
  }
  const numeric = value.kind === 'Int' || value.kind === 'Float' || value.kind === 'Decimal';
  return (
    <input
      aria-label="value"
      type={numeric ? 'number' : 'text'}
      style={sel}
      value={value.current == null ? '' : String(value.current)}
      onChange={(e) => value.set(numeric ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value)}
    />
  );
};

const Leaf = ({ node }: { node: LeafNode }) => (
  <div style={row} data-depth={node.depth} aria-invalid={!node.valid}>
    <Picker ariaLabel="field" value={node.field.value} options={node.field.options} onChange={node.field.set} />
    {node.field.acceptsSubPath && node.field.setSubPath && (
      <input
        aria-label="json sub-path"
        placeholder="json.path"
        style={sel}
        value={node.field.subPath ?? ''}
        onChange={(e) => node.field.setSubPath?.(e.target.value)}
      />
    )}
    <Picker ariaLabel="operator" value={node.operator.value} options={node.operator.options} onChange={node.operator.set} />
    <ValueField value={node.value} />
    {!node.valid && <span style={{ color: '#c00', fontSize: 12 }}>✗</span>}
    <button type="button" aria-label="remove" style={{ border: 'none', background: 'none', cursor: 'pointer' }} onClick={node.remove}>
      ✕
    </button>
  </div>
);

const Group = ({ node }: { node: GroupNode }) => {
  const [collapsed, setCollapsed] = useState(false); // collapse is display state → yours
  return (
    <div
      style={{
        border: `1px solid ${node.depth ? '#e2e8f0' : '#cbd5e1'}`,
        borderRadius: 8,
        padding: 12,
        display: 'grid',
        gap: 8,
        marginLeft: node.depth ? 16 : 0,
      }}
    >
      <div style={row}>
        <button type="button" style={{ border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? '▸' : '▾'}
        </button>
        <Picker
          ariaLabel="match type"
          value={node.operator.value}
          options={[
            { value: 'all', label: 'All (AND)' },
            { value: 'any', label: 'Any (OR)' },
          ]}
          onChange={(v) => node.operator.set(v === 'any' ? 'any' : 'all')}
        />
        {node.remove && (
          <button type="button" aria-label="remove group" style={{ border: 'none', background: 'none', cursor: 'pointer' }} onClick={node.remove}>
            ✕
          </button>
        )}
      </div>
      {!collapsed && (
        <>
          {node.children.map((c) => (
            <Node key={c.id} node={c} />
          ))}
          <div style={row}>
            <button type="button" style={sel} onClick={node.addRule}>
              + rule
            </button>
            {node.canAddGroup && (
              <button type="button" style={sel} onClick={node.addGroup}>
                + group
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const Node = ({ node }: { node: BuilderNode }) =>
  node.kind === 'group' ? <Group node={node} /> : <Leaf node={node} />;

/** Render a descriptor tree. Pass `root` from useRuleBuilder. */
export const RuleTree = ({ root }: { root: GroupNode }) => <Node node={root} />;

/** Convenience: the headless hook + the reference renderer wired together. */
export const RuleEditor = ({
  source,
  sourceValues,
  rule,
  onChange,
}: {
  source: RuleBuilderSource;
  sourceValues?: import('@inixiative/json-rules').SourceValues[];
  rule?: import('@inixiative/json-rules').Condition;
  onChange?: (rule: import('@inixiative/json-rules').Condition) => void;
}) => {
  const { root } = useRuleBuilder({ source, sourceValues, value: rule, onChange });
  return <RuleTree root={root} />;
};
