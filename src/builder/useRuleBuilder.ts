import {
  type Condition,
  describeRule,
  type Lens,
  type RuleDescription,
  type RuleTarget,
  validateRule,
} from '@inixiative/json-rules';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { stripMeta, switchGroupOperator, trimEmptyGroups, withIds } from '../core/decorate';
import {
  addRule,
  getNode,
  groupSiblings,
  removeNode,
  type RulePath,
  setNode,
  unwrapCompound,
  wrapInCompound,
} from '../core/tree';
import {
  type BuilderField,
  composeSurface,
  describeModelFields,
  type RuleBuilderSource,
} from '../schema/surface';

const EMPTY: Condition = { all: [] };

export type UseRuleBuilderOptions = {
  source: RuleBuilderSource;
  targets?: RuleTarget[];
  value?: Condition;
  onChange?: (clean: Condition) => void;
  labels?: Record<string, string>;
};

export type UseRuleBuilder = {
  lens: Lens;
  condition: Condition;
  getClean: () => Condition;
  fields: (mapName?: string, modelName?: string) => BuilderField[];
  describe: () => RuleDescription;
  validate: (target: RuleTarget) => ReturnType<typeof validateRule>;
  setCondition: (clean: Condition) => void;
  update: (path: RulePath, node: Condition) => void;
  remove: (path: RulePath) => void;
  add: (parentPath: RulePath, node: Condition) => void;
  wrap: (path: RulePath, kind: 'all' | 'any') => void;
  unwrap: (path: RulePath) => void;
  group: (parentPath: RulePath, indices: number[], kind: 'all' | 'any') => void;
  switchOperator: (path: RulePath, kind: 'all' | 'any') => void;
};

export const useRuleBuilder = (opts: UseRuleBuilderOptions): UseRuleBuilder => {
  const lens = useMemo(() => composeSurface(opts.source), [opts.source]);
  const [tree, setTree] = useState<Condition>(() => withIds(opts.value ?? EMPTY));

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

  const apply = useCallback((fn: (t: Condition) => Condition) => {
    setTree((prev) => withIds(fn(prev)));
  }, []);

  return {
    lens,
    condition: tree,
    getClean: () => clean(tree),
    fields: (mapName = lens.mapName, modelName = lens.model) =>
      describeModelFields(lens, mapName, modelName, { targets: opts.targets, labels: opts.labels }),
    describe: () => describeRule(clean(tree), lens),
    validate: (target) => validateRule(clean(tree), { target }),
    setCondition: (c) => setTree(withIds(c)),
    update: (path, node) => apply((t) => setNode(t, path, node)),
    remove: (path) => apply((t) => removeNode(t, path)),
    add: (parentPath, node) => apply((t) => addRule(t, parentPath, node)),
    wrap: (path, kind) => apply((t) => wrapInCompound(t, path, kind)),
    unwrap: (path) => apply((t) => unwrapCompound(t, path)),
    group: (parentPath, indices, kind) => apply((t) => groupSiblings(t, parentPath, indices, kind)),
    switchOperator: (path, kind) =>
      apply((t) => {
        const node = getNode(t, path);
        if (node === undefined) throw new Error('switchOperator: path does not resolve');
        return setNode(t, path, switchGroupOperator(node, kind));
      }),
  };
};
