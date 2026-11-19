import {
  describeValue,
  type FieldKind,
  type SourceValues,
  type ValueDescription,
  type ValueExpression,
  type ValueExpressionShape,
  type ValueType,
} from '@inixiative/json-rules';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  describeScopeFields,
  type RuleBuilderSource,
  resolve,
  type SurfaceOptions,
  viewRoot,
} from '../schema/surface';
import { buildValueExpressionRoot, type ValueNode } from './buildValueExpressionRoot';
import { cleanValue } from './cleanValue';

export type UseValueExpressionBuilderOptions = {
  source: RuleBuilderSource;
  sourceValues?: SourceValues[];
  /** Uncontrolled seed, read once at mount. Re-mount (`key`) or `setValue` to reseed. */
  defaultValue?: ValueExpression;
  onChange?: (value: ValueExpression) => void;
  bindings?: boolean;
  shapes?: readonly ValueExpressionShape[];
  expectedKind?: FieldKind;
  acceptsType?: (type: ValueType) => boolean;
  surfaceOpts?: SurfaceOptions;
  maxDepth?: number;
};

export type UseValueExpressionBuilder = {
  /** The cleaned, serializable expression. */
  value: ValueExpression;
  root: ValueNode;
  /** json-rules' `describeValue` of `value`: its type, paths read, clock unit and issues. */
  description: ValueDescription;
  setValue: (value: ValueExpression | undefined) => void;
};

/** Headless editor for a json-rules value expression (`evaluateValue`) over a lens source. Owns
 *  the expression and exposes the {@link buildValueExpressionRoot} tree. */
export const useValueExpressionBuilder = (
  opts: UseValueExpressionBuilderOptions,
): UseValueExpressionBuilder => {
  const view = useMemo(
    () => resolve(opts.source, { sourceValues: opts.sourceValues }),
    [opts.source, opts.sourceValues],
  );
  const fields = useMemo(
    () => describeScopeFields(viewRoot(view), opts.surfaceOpts),
    [view, opts.surfaceOpts],
  );
  const [tree, setTree] = useState<ValueExpression>(() => opts.defaultValue ?? '');

  const onChangeRef = useRef(opts.onChange);
  onChangeRef.current = opts.onChange;
  const first = useRef(true);
  const value = useMemo(() => cleanValue(tree, view.lens), [tree, view]);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onChangeRef.current?.(value);
  }, [value]);

  const commit = useCallback((next: ValueExpression) => setTree(next), []);
  const root = useMemo(
    () =>
      buildValueExpressionRoot(tree, {
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
  const description = useMemo(() => describeValue(value, view.lens), [value, view]);

  return { value, root, description, setValue: (next) => setTree(next ?? '') };
};
