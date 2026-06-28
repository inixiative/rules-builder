import {
  type Condition,
  describeRule,
  type Lens,
  type RuleDescription,
  type RuleTarget,
  validateRule,
} from '@inixiative/json-rules';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { stripMeta, trimEmptyGroups, withIds } from '../core/decorate';
import { describeModelFields, resolve, type RuleBuilderSource } from '../schema/surface';
import { asGroupRoot, buildRoot, type GroupNode } from './buildNodes';

const EMPTY: Condition = { all: [] };

export type UseRuleBuilderOptions = {
  source: RuleBuilderSource;
  /** Fetched option sets for the source's sourced fields → folded onto field.values. */
  sourceValues?: import('@inixiative/json-rules').SourceValues[];
  targets?: RuleTarget[];
  value?: Condition;
  onChange?: (clean: Condition) => void;
  labels?: Record<string, string>;
  maxDepth?: number;
};

/**
 * Headless rule builder. Owns the Condition JSON and exposes a `root` descriptor
 * tree (what controls exist at each level + bound actions). Renders nothing —
 * wire your own components to `root`. `value` is the cleaned, serializable output.
 */
export type UseRuleBuilder = {
  value: Condition;
  root: GroupNode;
  lens: Lens;
  setCondition: (clean: Condition) => void;
  validate: (target: RuleTarget) => ReturnType<typeof validateRule>;
  describe: () => RuleDescription;
};

export const useRuleBuilder = (opts: UseRuleBuilderOptions): UseRuleBuilder => {
  const lens = useMemo(
    () => resolve(opts.source, { sourceValues: opts.sourceValues }),
    [opts.source, opts.sourceValues],
  );
  const fields = useMemo(
    () => describeModelFields(lens, lens.mapName, lens.model, { targets: opts.targets, labels: opts.labels }),
    [lens, opts.targets, opts.labels],
  );
  const maxDepth = opts.maxDepth ?? 4;

  const [tree, setTree] = useState<Condition>(() => withIds(asGroupRoot(opts.value)));

  const onChangeRef = useRef(opts.onChange);
  onChangeRef.current = opts.onChange;
  const first = useRef(true);

  const clean = useCallback((t: Condition): Condition => stripMeta(trimEmptyGroups(t) ?? EMPTY), []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onChangeRef.current?.(clean(tree));
  }, [tree, clean]);

  const commit = useCallback((next: Condition) => setTree(withIds(next)), []);
  const root = useMemo(
    () => buildRoot(tree, lens, fields, maxDepth, commit),
    [tree, lens, fields, maxDepth, commit],
  );

  return {
    value: clean(tree),
    root,
    lens,
    setCondition: (c) => setTree(withIds(asGroupRoot(c))),
    validate: (target) => validateRule(clean(tree), { target }),
    describe: () => describeRule(clean(tree), lens),
  };
};
