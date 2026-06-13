import type { RulePath } from '../core/tree';
import { useRuleBuilderContext } from './context';

export type GroupHeaderProps = { path: RulePath; operator: 'all' | 'any' };

export const GroupHeader = ({ path, operator }: GroupHeaderProps) => {
  const { slots, builder } = useRuleBuilderContext();
  const { Select } = slots;
  return (
    <Select
      aria-label="match type"
      options={[
        { value: 'all', label: 'All (AND)' },
        { value: 'any', label: 'Any (OR)' },
      ]}
      value={operator}
      onChange={(v) => builder.switchOperator(path, v === 'any' ? 'any' : 'all')}
    />
  );
};
