import type { RulePath } from '../core/tree';
import { useRuleBuilderContext } from './context';
import { defaultRule } from './nodes';

export type GroupFooterProps = { path: RulePath; depth: number };

export const GroupFooter = ({ path, depth }: GroupFooterProps) => {
  const { slots, builder, maxDepth } = useRuleBuilderContext();
  const { Button } = slots;
  return (
    <>
      <Button onClick={() => builder.add(path, defaultRule(builder.fields()))}>Add rule</Button>
      {depth < maxDepth && (
        <Button variant="outline" onClick={() => builder.add(path, { all: [] })}>
          Add group
        </Button>
      )}
    </>
  );
};
