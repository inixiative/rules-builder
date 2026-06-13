import { type Condition, NUMERIC_KINDS, type ValueShape } from '@inixiative/json-rules';
import { getNode, type RulePath } from '../core/tree';
import type { BuilderField } from '../schema/surface';
import { valueShapeForOperator } from '../schema/surface';
import { useRuleBuilderContext } from './context';
import { ruleForField } from './nodes';

type Rec = Record<string, unknown>;

const isNumeric = (f: BuilderField) => (NUMERIC_KINDS as readonly string[]).includes(f.kind);
const MULTI_SHAPES = new Set<ValueShape>(['array', 'dayList']);
const RANGE_SHAPES = new Set<ValueShape>(['range', 'dateRange']);

export type RuleRowProps = { path: RulePath };

export const RuleRow = ({ path }: RuleRowProps) => {
  const { slots, builder } = useRuleBuilderContext();
  const node = getNode(builder.condition, path) as Rec | undefined;
  if (!node) return null;

  const fields = builder.fields();
  const fieldName = node.field as string;
  const field = fields.find((f) => f.name === fieldName);
  const operator = (node.dateOperator ?? node.operator) as string;
  const keyName = node.dateOperator !== undefined ? 'dateOperator' : 'operator';

  const set = (patch: Rec) => builder.update(path, { ...node, ...patch } as Condition);

  const onField = (name: string) => {
    const next = fields.find((f) => f.name === name);
    if (next) builder.update(path, ruleForField(next, node._id as string | undefined));
  };

  const operatorOptions = field
    ? [...field.operators.field, ...field.operators.date].map((o) => ({ value: o, label: o }))
    : [];

  return (
    <slots.RuleRow>
      <slots.Select
        aria-label="field"
        options={fields.map((f) => ({ value: f.name, label: f.label }))}
        value={fieldName ?? ''}
        onChange={onField}
      />
      <slots.Select
        aria-label="operator"
        options={operatorOptions}
        value={operator ?? ''}
        onChange={(o) => {
          const isDate = field?.operators.date.includes(o as never) ?? false;
          const { operator: _o, dateOperator: _d, ...rest } = node;
          builder.update(path, { ...rest, [isDate ? 'dateOperator' : 'operator']: o } as Condition);
        }}
      />
      {field && operator && (
        <ValueInput
          field={field}
          shape={valueShapeForOperator(operator as never)}
          value={node.value}
          onChange={(value) => set({ value })}
        />
      )}
      <slots.IconButton aria-label="remove rule" onClick={() => builder.remove(path)}>
        ✕
      </slots.IconButton>
    </slots.RuleRow>
  );
};

type ValueInputProps = {
  field: BuilderField;
  shape: ValueShape;
  value: unknown;
  onChange: (value: unknown) => void;
};

const ValueInput = ({ field, shape, value, onChange }: ValueInputProps) => {
  const { slots } = useRuleBuilderContext();

  if (shape === 'none') return null;

  if (field.enumValues) {
    const options = field.enumValues.map((v) => ({ value: v, label: v }));
    if (MULTI_SHAPES.has(shape)) {
      return (
        <slots.MultiSelect
          aria-label="value"
          options={options}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
        />
      );
    }
    return (
      <slots.Select
        aria-label="value"
        options={options}
        value={typeof value === 'string' ? value : ''}
        onChange={onChange}
      />
    );
  }

  if (field.kind === 'Boolean') {
    return (
      <slots.Switch aria-label="value" checked={value === true} onChange={onChange} />
    );
  }

  if (RANGE_SHAPES.has(shape)) {
    const pair = Array.isArray(value) ? (value as unknown[]) : [undefined, undefined];
    const setAt = (i: number, v: unknown) => {
      const next = [pair[0], pair[1]];
      next[i] = v;
      onChange(next);
    };
    return (
      <>
        <ScalarInput field={field} shape={shape} value={pair[0]} onChange={(v) => setAt(0, v)} />
        <ScalarInput field={field} shape={shape} value={pair[1]} onChange={(v) => setAt(1, v)} />
      </>
    );
  }

  return <ScalarInput field={field} shape={shape} value={value} onChange={onChange} />;
};

const ScalarInput = ({ field, shape, value, onChange }: ValueInputProps) => {
  const { slots } = useRuleBuilderContext();

  if (shape === 'dateValue' || shape === 'dateRange' || field.kind === 'DateTime') {
    return (
      <slots.DatePicker
        aria-label="value"
        value={typeof value === 'string' ? new Date(value) : (value as Date | undefined)}
        onChange={(d) => onChange(d?.toISOString())}
      />
    );
  }
  if (isNumeric(field) || shape === 'count') {
    return (
      <slots.NumberInput
        aria-label="value"
        value={typeof value === 'number' ? value : undefined}
        onChange={onChange}
      />
    );
  }
  return (
    <slots.TextInput
      aria-label="value"
      value={typeof value === 'string' ? value : ''}
      onChange={onChange}
    />
  );
};
