import type { Condition, SourceValues } from '@inixiative/json-rules';
import { useState } from 'react';
import {
  type BuilderNode,
  type GroupNode,
  type LeafNode,
  type RuleBuilderSource,
  useRuleBuilder,
  type ValueControl,
} from '../src';
import { Badge, Button, Input, MultiSelect, Select } from './shadcn';

/**
 * shadcn-style drop-in renderer for the headless rule builder — the SAME `root`
 * descriptors as the plain RuleTree, wired to Tailwind/shadcn primitives (mirroring
 * @template/ui). Copy this, point the imports at your own `@/components/ui`, done.
 */

const ValueField = ({ value }: { value: ValueControl }) => {
  if (value.shape === 'none') return null;
  if (value.options) {
    if (value.shape === 'array' || value.shape === 'dayList') {
      const current = Array.isArray(value.current) ? (value.current as string[]) : [];
      return <MultiSelect aria-label="value" options={value.options} value={current} onChange={value.set} />;
    }
    return (
      <Select
        aria-label="value"
        placeholder="value"
        options={value.options}
        value={value.current == null ? '' : String(value.current)}
        onChange={value.set}
      />
    );
  }
  if (value.kind === 'Boolean') {
    return (
      <Select
        aria-label="value"
        placeholder="value"
        options={[
          { value: 'true', label: 'true' },
          { value: 'false', label: 'false' },
        ]}
        value={value.current === true ? 'true' : value.current === false ? 'false' : ''}
        onChange={(v) => value.set(v === 'true')}
      />
    );
  }
  if (value.kind === 'DateTime') {
    return (
      <Input
        aria-label="value"
        type="date"
        value={typeof value.current === 'string' ? value.current.slice(0, 10) : ''}
        onChange={(e) => value.set(e.target.value)}
      />
    );
  }
  const numeric = value.kind === 'Int' || value.kind === 'Float' || value.kind === 'Decimal';
  return (
    <Input
      aria-label="value"
      type={numeric ? 'number' : 'text'}
      value={value.current == null ? '' : String(value.current)}
      onChange={(e) => value.set(numeric ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value)}
    />
  );
};

const Leaf = ({ node }: { node: LeafNode }) => (
  <div className="flex flex-wrap items-center gap-2" aria-invalid={!node.valid}>
    <Select aria-label="field" placeholder="field" options={node.field.options} value={node.field.value ?? ''} onChange={node.field.set} />
    {node.field.acceptsSubPath && node.field.setSubPath && (
      <Input
        aria-label="json sub-path"
        placeholder="json.path"
        value={node.field.subPath ?? ''}
        onChange={(e) => node.field.setSubPath?.(e.target.value)}
      />
    )}
    <Select aria-label="operator" placeholder="operator" options={node.operator.options} value={node.operator.value ?? ''} onChange={node.operator.set} />
    <ValueField value={node.value} />
    {!node.valid && (
      <Badge tone="danger" title="value not in the allowed set">
        ✗
      </Badge>
    )}
    <Button aria-label="remove" variant="ghost" size="icon" onClick={node.remove}>
      ✕
    </Button>
  </div>
);

const Group = ({ node }: { node: GroupNode }) => {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div
      className={`rounded-lg border border-border border-l-2 p-3 ${node.depth ? 'ml-4 border-l-muted-foreground/40 bg-muted/30' : 'border-l-primary'}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="collapse" onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? '▸' : '▾'}
        </Button>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">conditions — match</span>
        <Select
          aria-label="match type"
          options={[
            { value: 'all', label: 'All (AND)' },
            { value: 'any', label: 'Any (OR)' },
          ]}
          value={node.operator.value}
          onChange={(v) => node.operator.set(v === 'any' ? 'any' : 'all')}
        />
        {node.remove && (
          <Button variant="ghost" size="icon" aria-label="remove group" onClick={node.remove}>
            ✕
          </Button>
        )}
      </div>
      {!collapsed && (
        <div className="mt-2 grid gap-2">
          {node.children.map((c) => (
            <Node key={c.id} node={c} />
          ))}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={node.addRule}>
              + rule
            </Button>
            {node.canAddGroup && (
              <Button variant="outline" size="sm" onClick={node.addGroup}>
                + group
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const Node = ({ node }: { node: BuilderNode }) =>
  node.kind === 'group' ? <Group node={node} /> : <Leaf node={node} />;

export const RuleTreeShadcn = ({ root }: { root: GroupNode }) => <Node node={root} />;

export const RuleEditorShadcn = ({
  source,
  sourceValues,
  rule,
  onChange,
}: {
  source: RuleBuilderSource;
  sourceValues?: SourceValues[];
  rule?: Condition;
  onChange?: (rule: Condition) => void;
}) => {
  const { root } = useRuleBuilder({ source, sourceValues, value: rule, onChange });
  return <RuleTreeShadcn root={root} />;
};
