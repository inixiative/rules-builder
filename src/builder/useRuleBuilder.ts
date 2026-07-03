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
import { describeModelFields, type RuleBuilderSource, resolve } from '../schema/surface';
import { asRoot, type BuilderNode, buildRoot } from './buildNodes';

const EMPTY: Condition = { all: [] };

export type UseRuleBuilderOptions = {
  source: RuleBuilderSource;
  /** Fetched option sets for the source's sourced fields → folded onto field.values. */
  sourceValues?: import('@inixiative/json-rules').SourceValues[];
  targets?: RuleTarget[];
  /** Uncontrolled seed — read once at mount. Re-mount (`key`) or `setCondition` to reseed. */
  defaultValue?: Condition;
  onChange?: (clean: Condition) => void;
  labels?: Record<string, string>;
  valueLabels?: Record<string, Record<string, string>>;
  /** Max group nesting depth — a group at this depth hides "add group" (`canAddGroup`). Default 4. */
  maxDepth?: number;
};

/**
 * Headless rule builder. Owns the Condition JSON and exposes a `root` descriptor
 * tree (what controls exist at each level + bound actions). Renders nothing —
 * wire your own components to `root`. `value` is the cleaned, serializable output.
 */
export type UseRuleBuilder = {
  value: Condition;
  root: BuilderNode;
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
    () =>
      describeModelFields(lens, lens.mapName, lens.model, {
        targets: opts.targets,
        labels: opts.labels,
        valueLabels: opts.valueLabels,
      }),
    [lens, opts.targets, opts.labels, opts.valueLabels],
  );
  const maxDepth = opts.maxDepth ?? 4;

  const [tree, setTree] = useState<Condition>(() => withIds(asRoot(opts.defaultValue)));

  const onChangeRef = useRef(opts.onChange);
  onChangeRef.current = opts.onChange;
  const first = useRef(true);

  const clean = useCallback(
    (t: Condition): Condition => stripMeta(trimEmptyGroups(t) ?? EMPTY),
    [],
  );

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
    setCondition: (c) => setTree(withIds(asRoot(c))),
    validate: (target) => validateRule(clean(tree), { target }),
    describe: () => describeRule(clean(tree), lens),
  };
};
