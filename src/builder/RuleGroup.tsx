import { getNode, type RulePath } from '../core/tree';
import { useRuleBuilderContext } from './context';
import { GroupFooter } from './GroupFooter';
import { GroupHeader } from './GroupHeader';
import { groupChildrenOf, groupOperatorOf, isGroupNode, nodeKey } from './nodes';
import { RuleRow } from './RuleRow';

export type RuleGroupProps = { path: RulePath; depth: number };

export const RuleGroup = ({ path, depth }: RuleGroupProps) => {
  const { slots, builder } = useRuleBuilderContext();
  const node = getNode(builder.condition, path);
  if (node === undefined || !isGroupNode(node)) return null;

  const operator = groupOperatorOf(node);
  const children = groupChildrenOf(node);
  const Wrapper = depth === 0 ? slots.CompoundWrapper : slots.NestedWrapper;

  return (
    <Wrapper>
      <GroupHeader path={path} operator={operator} />
      {children.map((child, i) => {
        const childPath: RulePath = [...path, i];
        return isGroupNode(child) ? (
          <RuleGroup key={nodeKey(child, i)} path={childPath} depth={depth + 1} />
        ) : (
          <RuleRow key={nodeKey(child, i)} path={childPath} />
        );
      })}
      <GroupFooter path={path} depth={depth} />
    </Wrapper>
  );
};
