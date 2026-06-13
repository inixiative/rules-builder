import type { Condition } from '@inixiative/json-rules';
import type { BuilderField } from '../schema/surface';

type Rec = Record<string, unknown>;

export const isGroupNode = (n: Condition): boolean =>
  typeof n === 'object' && n !== null && ('all' in n || 'any' in n);

export const groupOperatorOf = (n: Condition): 'all' | 'any' =>
  typeof n === 'object' && n !== null && 'any' in n ? 'any' : 'all';

export const groupChildrenOf = (n: Condition): Condition[] => {
  const r = n as Rec;
  return (Array.isArray(r.all) ? r.all : Array.isArray(r.any) ? r.any : []) as Condition[];
};

export const nodeKey = (n: Condition, index: number): string => {
  const r = n as Rec;
  return (r._groupId as string) ?? (r._id as string) ?? String(index);
};

const firstOperator = (field: BuilderField): { key: 'operator' | 'dateOperator'; op: string } | null => {
  if (field.operators.field.length > 0) return { key: 'operator', op: field.operators.field[0] };
  if (field.operators.date.length > 0) return { key: 'dateOperator', op: field.operators.date[0] };
  return null;
};

export const ruleForField = (field: BuilderField, keepId?: string): Condition => {
  const first = firstOperator(field);
  const id = keepId ? { _id: keepId } : {};
  if (!first) return { field: field.name, operator: 'equals', value: '', ...id } as Condition;
  return { field: field.name, [first.key]: first.op, value: '', ...id } as Condition;
};

export const defaultRule = (fields: BuilderField[]): Condition => {
  const usable = fields.find((f) => firstOperator(f) !== null) ?? fields[0];
  return usable
    ? ruleForField(usable)
    : ({ field: '', operator: 'equals', value: '' } as Condition);
};
