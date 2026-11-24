import type { SchemaMap } from '@inixiative/permissions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defaultActionRule } from './actionTree';
import { type ActionRuleNode, buildActionRoot } from './buildActionRoot';
import type { ActionRule } from './types';

export type UseActionRuleBuilderOptions = {
  /** permissions' schema map; the rule is authored in the lens permissions judges it in. */
  schemaMap: SchemaMap;
  /** The resource the rule is on. */
  resource: string;
  /** The action the rule defines, never offered as its own delegate. */
  action?: string;
  /** Uncontrolled seed — read once at mount. Re-mount (`key`) or `setRule` to reseed. */
  defaultValue?: ActionRule;
  onChange?: (rule: ActionRule) => void;
  maxDepth?: number;
};

/**
 * Headless builder for one permissions action rule (`ActionRule`) on a resource. Owns the rule;
 * exposes the `buildActionRoot` tree, which offers what permissions accepts.
 */
export type UseActionRuleBuilder = {
  value: ActionRule;
  root: ActionRuleNode;
  setRule: (rule: ActionRule) => void;
};

export const useActionRuleBuilder = (opts: UseActionRuleBuilderOptions): UseActionRuleBuilder => {
  const [tree, setTree] = useState<ActionRule>(() => opts.defaultValue ?? defaultActionRule());

  const onChangeRef = useRef(opts.onChange);
  onChangeRef.current = opts.onChange;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onChangeRef.current?.(tree);
  }, [tree]);

  const commit = useCallback((next: ActionRule) => setTree(next), []);
  const root = useMemo(
    () =>
      buildActionRoot(tree, {
        schemaMap: opts.schemaMap,
        resource: opts.resource,
        action: opts.action,
        maxDepth: opts.maxDepth,
        commit,
      }),
    [tree, opts.schemaMap, opts.resource, opts.action, opts.maxDepth, commit],
  );

  return { value: tree, root, setRule: setTree };
};
