import { useState } from 'react';
import {
  type ArrayNode,
  type BuilderNode,
  type Decoration,
  type GroupNode,
  type LeafNode,
  type RuleBuilderSource,
  useRuleBuilder,
  type ValueControl,
} from '../src';

/** Fold a picker option's icon into its label so a native <select> renders it
 *  (an <option> can't hold arbitrary markup). Field options carry `icon` from a
 *  {@link Decoration}; everywhere else it's absent and labels pass through. */
const iconize = (options: readonly { value: string; label: string; icon?: string }[]) =>
  options.map((o) => ({ value: o.value, label: o.icon ? `${o.icon}  ${o.label}` : o.label }));

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
const row: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
  flexWrap: 'wrap',
};

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
  <select
    aria-label={ariaLabel}
    style={sel}
    value={value ?? ''}
    onChange={(e) => onChange(e.target.value)}
  >
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

const LiteralValue = ({ value }: { value: ValueControl }) => {
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
    return (
      <Picker
        ariaLabel="value"
        value={value.current == null ? '' : String(value.current)}
        options={value.options}
        onChange={value.set}
      />
    );
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
      onChange={(e) =>
        value.set(
          numeric ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value,
        )
      }
    />
  );
};

const ValueField = ({ value }: { value: ValueControl }) => {
  if (value.shape === 'none') return null;
  return (
    <>
      <Picker
        ariaLabel="value mode"
        value={value.mode}
        options={[
          { value: 'value', label: '= value' },
          { value: 'path', label: '→ field' },
          { value: 'bind', label: '⟐ bind' },
        ]}
        onChange={(m) => value.setMode(m as 'value' | 'path' | 'bind')}
      />
      {value.mode === 'path' ? (
        <input
          aria-label="path"
          placeholder="field.path"
          style={sel}
          value={value.path?.value ?? ''}
          onChange={(e) => value.path?.set(e.target.value)}
        />
      ) : value.mode === 'bind' ? (
        <input
          aria-label="bind"
          placeholder="bindName"
          style={sel}
          value={value.bind?.value ?? ''}
          onChange={(e) => value.bind?.set(e.target.value)}
        />
      ) : (
        <LiteralValue value={value} />
      )}
    </>
  );
};

const Leaf = ({ node }: { node: LeafNode }) => (
  <div style={row} data-depth={node.depth} aria-invalid={!node.valid}>
    <Picker
      ariaLabel="leaf kind"
      value={node.leafKind}
      options={[
        { value: 'field', label: 'field' },
        { value: 'boolean', label: 'true/false' },
      ]}
      onChange={(k) => node.setLeafKind(k as 'field' | 'boolean')}
    />
    {node.leafKind === 'boolean' && node.literal ? (
      <Picker
        ariaLabel="boolean value"
        value={String(node.literal.value)}
        options={[
          { value: 'true', label: 'true' },
          { value: 'false', label: 'false' },
        ]}
        onChange={(v) => node.literal?.set(v === 'true')}
      />
    ) : (
      node.field &&
      node.operator &&
      node.value && (
        <>
          <Picker
            ariaLabel="field"
            value={node.field.value}
            options={iconize(node.field.options)}
            onChange={node.field.set}
          />
          {node.field.acceptsSubPath && node.field.setSubPath && (
            <input
              aria-label="json sub-path"
              placeholder="json.path"
              style={sel}
              value={node.field.subPath ?? ''}
              onChange={(e) => node.field?.setSubPath?.(e.target.value)}
            />
          )}
          <Picker
            ariaLabel="operator"
            value={node.operator.value}
            options={node.operator.options}
            onChange={node.operator.set}
          />
          <ValueField value={node.value} />
        </>
      )
    )}
    {!node.valid && <span style={{ color: '#c00', fontSize: 12 }}>✗</span>}
    <button
      type="button"
      aria-label="remove"
      style={{ border: 'none', background: 'none', cursor: 'pointer' }}
      onClick={node.remove}
    >
      ✕
    </button>
  </div>
);

const subLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#64748b',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

/** A list/relation rule: field + arrayOperator (+ count) with nested filter/condition
 *  sub-builders scoped to the related model. */
const ArrayRule = ({ node }: { node: ArrayNode }) => (
  <div
    data-depth={node.depth}
    aria-invalid={!node.valid}
    style={{
      border: '1px solid #e2e8f0',
      borderLeft: '3px solid #7048e8',
      borderRadius: 8,
      padding: 10,
      display: 'grid',
      gap: 8,
      background: '#faf9ff',
    }}
  >
    <div style={row}>
      <Picker
        ariaLabel="field"
        value={node.field.value}
        options={iconize(node.field.options)}
        onChange={node.field.set}
      />
      <Picker
        ariaLabel="array operator"
        value={node.arrayOperator.value}
        options={node.arrayOperator.options}
        onChange={node.arrayOperator.set}
      />
      {node.count && (
        <input
          aria-label="count"
          type="number"
          style={{ ...sel, width: 80 }}
          value={node.count.value ?? ''}
          onChange={(e) =>
            node.count?.set(e.target.value === '' ? undefined : Number(e.target.value))
          }
        />
      )}
      {node.relation && (
        <span style={{ fontSize: 11, color: '#7048e8' }}>↪ {node.relation.modelName}</span>
      )}
      {!node.valid && <span style={{ color: '#c00', fontSize: 12 }}>✗</span>}
      <button
        type="button"
        aria-label="remove"
        style={{
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          marginLeft: 'auto',
        }}
        onClick={node.remove}
      >
        ✕
      </button>
    </div>

    {node.condition && (
      <div style={{ display: 'grid', gap: 4 }}>
        <span style={subLabel}>{node.arrayOperator.value} element matches</span>
        <Node node={node.condition} />
      </div>
    )}

    {node.filter &&
      (node.filter.children.length > 0 ? (
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={row}>
            <span style={subLabel}>filter — only elements where</span>
            {node.removeFilter && (
              <button
                type="button"
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                  color: '#64748b',
                }}
                onClick={node.removeFilter}
              >
                clear filter
              </button>
            )}
          </div>
          <Node node={node.filter} />
        </div>
      ) : (
        <button
          type="button"
          style={{ ...sel, justifySelf: 'start', color: '#64748b' }}
          onClick={node.filter.addRule}
        >
          + element filter
        </button>
      ))}
  </div>
);

const Group = ({ node }: { node: GroupNode }) => {
  const [collapsed, setCollapsed] = useState(false); // collapse is display state → yours
  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderLeft: `3px solid ${node.depth ? '#94a3b8' : '#3b5bdb'}`,
        borderRadius: 8,
        padding: 12,
        display: 'grid',
        gap: 8,
        marginLeft: node.depth ? 16 : 0,
        background: node.depth % 2 === 1 ? '#f8fafc' : '#fff',
      }}
    >
      <div style={row}>
        <button
          type="button"
          style={{ border: 'none', background: 'none', cursor: 'pointer' }}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#64748b',
            letterSpacing: '0.08em',
          }}
        >
          CONDITIONS — match
        </span>
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
          <button
            type="button"
            aria-label="remove group"
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}
            onClick={node.remove}
          >
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
  node.kind === 'group' ? (
    <Group node={node} />
  ) : node.kind === 'array' ? (
    <ArrayRule node={node} />
  ) : (
    <Leaf node={node} />
  );

/** Render a descriptor tree. Pass `root` from useRuleBuilder — a group, a leaf, an array rule, or a
 *  `true`/`false` literal leaf (the root is never force-wrapped). */
export const RuleTree = ({ root }: { root: BuilderNode }) => <Node node={root} />;

/** Convenience: the headless hook + the reference renderer wired together. */
export const RuleEditor = ({
  source,
  sourceValues,
  rule,
  onChange,
  maxDepth,
  decoration,
}: {
  source: RuleBuilderSource;
  sourceValues?: import('@inixiative/json-rules').SourceValues[];
  rule?: import('@inixiative/json-rules').Condition;
  onChange?: (rule: import('@inixiative/json-rules').Condition) => void;
  maxDepth?: number;
  decoration?: Decoration;
}) => {
  const { root } = useRuleBuilder({
    source,
    sourceValues,
    defaultValue: rule,
    onChange,
    maxDepth,
    decoration,
  });
  return <RuleTree root={root} />;
};
