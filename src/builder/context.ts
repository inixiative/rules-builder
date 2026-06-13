import { createContext, useContext } from 'react';
import type { ComponentSlots } from './slots';
import type { UseRuleBuilder } from './useRuleBuilder';

export type RuleBuilderContextValue = {
  slots: ComponentSlots;
  builder: UseRuleBuilder;
  maxDepth: number;
};

const Ctx = createContext<RuleBuilderContextValue | null>(null);

export const RuleBuilderContext = Ctx;

export const useRuleBuilderContext = (): RuleBuilderContextValue => {
  const value = useContext(Ctx);
  if (!value) throw new Error('RuleBuilder components must render inside <RuleBuilder>');
  return value;
};
