import type { SourceValues } from '@inixiative/json-rules';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type BuilderField,
  describeModelFields,
  type RuleBuilderSource,
  resolve,
} from '../schema/surface';
import { defaultActionRule } from './actionTree';
import { type ActionRuleNode, buildActionRoot } from './buildActionRoot';
import type { ActionRule } from './types';

export type UseActionRuleBuilderOptions = {
  /** The lens/narrowing the rule is authored against — its fields, relations, and surface. */
  source: RuleBuilderSource;
  sourceValues?: SourceValues[];
  /** Uncontrolled seed — read once at mount. Re-mount (`key`) or `setRule` to reseed. */
  defaultValue?: ActionRule;
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
  const maps = opts.source.maps;
  const bridges = opts.source.bridges;
  const resourceFields = useCallback(
    (res: string): BuilderField[] => {
      const i = res.indexOf(':');
      const mapName = i === -1 ? '' : res.slice(0, i);
      const model = i === -1 ? res : res.slice(i + 1);
      if (!maps[mapName]?.models[model]) return [];
      return describeModelFields(resolve({ maps, bridges, mapName, model }), mapName, model);
    },
    [maps, bridges],
  );
  const root = useMemo(
    () =>
      buildActionRoot(tree, {
        lens,
        fields,
        siblingActions: opts.siblingActions ?? [],
        actionsByResource: opts.actionsByResource ?? {},
        resourceFields,
        maxDepth: opts.maxDepth,
        commit,
      }),
    [
      tree,
      lens,
      fields,
      opts.siblingActions,
      opts.actionsByResource,
      opts.maxDepth,
      commit,
      resourceFields,
    ],
  );

  return { value: tree, root, setRule: setTree };
};
