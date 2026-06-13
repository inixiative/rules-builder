import { useMemo } from 'react';
import { RuleBuilderContext } from './context';
import { RuleGroup } from './RuleGroup';
import type { ComponentSlots } from './slots';
import { type UseRuleBuilderOptions, useRuleBuilder } from './useRuleBuilder';

export type RuleBuilderProps = UseRuleBuilderOptions & {
  slots: ComponentSlots;
  maxDepth?: number;
};

export const RuleBuilder = ({ slots, maxDepth = 4, ...options }: RuleBuilderProps) => {
  const builder = useRuleBuilder(options);
  const value = useMemo(
    () => ({ slots, builder, maxDepth }),
    [slots, builder, maxDepth],
  );
  return (
    <RuleBuilderContext.Provider value={value}>
      <RuleGroup path={[]} depth={0} />
    </RuleBuilderContext.Provider>
  );
};
