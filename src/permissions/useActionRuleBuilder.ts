import type { SourceValues } from '@inixiative/json-rules';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { describeModelFields, resolve, type RuleBuilderSource } from '../schema/surface';
import { type ActionRuleNode, buildActionRoot } from './buildActionRoot';
import { defaultActionRule } from './actionTree';
import type { ActionRule } from './types';

export type UseActionRuleBuilderOptions = {
  /** The lens/narrowing the rule is authored against — its fields, relations, and surface. */
  source: RuleBuilderSource;
  sourceValues?: SourceValues[];
  value?: ActionRule;
  onChange?: (rule: ActionRule) => void;
  /** Other action names on this resource → delegate targets. */
  siblingActions?: string[];
  /** Action names per resource (`map:model`) → the `rel` walk's target actions. */
  actionsByResource?: Record<string, string[]>;
  maxDepth?: number;
};

/**
 * Headless builder for the recursive permission algebra (`ActionRule`) over a
 * lens/narrowing base. Owns the rule; exposes a `root` descriptor tree. The `rule`
 * (abac) leaf embeds the json-rules builder; `self`/`rel`/`delegate` are resource-aware.
 */
export type UseActionRuleBuilder = {
  value: ActionRule;
  root: ActionRuleNode;
  setRule: (rule: ActionRule) => void;
};

export const useActionRuleBuilder = (opts: UseActionRuleBuilderOptions): UseActionRuleBuilder => {
  const lens = useMemo(
    () => resolve(opts.source, { sourceValues: opts.sourceValues }),
    [opts.source, opts.sourceValues],
  );
  const fields = useMemo(() => describeModelFields(lens, lens.mapName, lens.model), [lens]);

  const [tree, setTree] = useState<ActionRule>(() => opts.value ?? defaultActionRule());

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
        lens,
        fields,
        siblingActions: opts.siblingActions ?? [],
        actionsByResource: opts.actionsByResource ?? {},
        maxDepth: opts.maxDepth,
        commit,
      }),
    [tree, lens, fields, opts.siblingActions, opts.actionsByResource, opts.maxDepth, commit],
  );

  return { value: tree, root, setRule: setTree };
};
