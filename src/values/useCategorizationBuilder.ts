import type {
  Categorization,
  FieldKind,
  SourceValues,
  ValueExpressionShape,
  ValueType,
} from '@inixiative/json-rules';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  describeScopeFields,
  type RuleBuilderSource,
  resolve,
  type SurfaceOptions,
  viewRoot,
} from '../schema/surface';
import { buildCategorizationRoot, type CategorizationNode } from './buildCategorizationRoot';
import { cleanCategorization } from './cleanValue';

export type UseCategorizationBuilderOptions = {
  source: RuleBuilderSource;
  sourceValues?: SourceValues[];
  /** Uncontrolled seed, read once at mount. Re-mount (`key`) or `setCategorization` to reseed. */
  defaultValue?: Categorization;
  onChange?: (categorization: Categorization) => void;
  bindings?: boolean;
  shapes?: readonly ValueExpressionShape[];
  expectedKind?: FieldKind;
  acceptsType?: (type: ValueType) => boolean;
  surfaceOpts?: SurfaceOptions;
  maxDepth?: number;
};

export type UseCategorizationBuilder = {
  /** The cleaned, serializable categorization. */
  value: Categorization;
  root: CategorizationNode;
  setCategorization: (categorization: Categorization | undefined) => void;
};

/** Headless editor for a json-rules categorization (`categorize`): ordered cases, `match`,
 *  `default`, over a lens source. A preview is the caller's: it runs its own evaluator (Zealot
 *  widens dates and sets engine globals), so it never disagrees with production. */
export const useCategorizationBuilder = (
  opts: UseCategorizationBuilderOptions,
): UseCategorizationBuilder => {
  const view = useMemo(
    () => resolve(opts.source, { sourceValues: opts.sourceValues }),
    [opts.source, opts.sourceValues],
  );
  const fields = useMemo(
    () => describeScopeFields(viewRoot(view), opts.surfaceOpts),
    [view, opts.surfaceOpts],
  );
  const [tree, setTree] = useState<Categorization>(() => opts.defaultValue ?? { cases: [] });

  const onChangeRef = useRef(opts.onChange);
  onChangeRef.current = opts.onChange;
  const first = useRef(true);
  const value = useMemo(() => cleanCategorization(tree, view.lens), [tree, view]);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onChangeRef.current?.(value);
  }, [value]);

  const commit = useCallback((next: Categorization) => setTree(next), []);
  const root = useMemo(
    () =>
      buildCategorizationRoot(tree, {
        view,
        fields,
        maxDepth: opts.maxDepth,
        commit,
        bindings: opts.bindings,
        shapes: opts.shapes,
        expectedKind: opts.expectedKind,
        acceptsType: opts.acceptsType,
        surfaceOpts: opts.surfaceOpts,
      }),
    [
      tree,
      view,
      fields,
      opts.maxDepth,
      commit,
      opts.bindings,
      opts.shapes,
      opts.expectedKind,
      opts.acceptsType,
      opts.surfaceOpts,
    ],
  );

  return { value, root, setCategorization: (next) => setTree(next ?? { cases: [] }) };
};
