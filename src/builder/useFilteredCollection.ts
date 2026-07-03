import { type CheckOptions, check, sourceValuesFromRows } from '@inixiative/json-rules';
import { useMemo } from 'react';
import { composeNarrowed } from '../schema/surface';
import { type UseRuleBuilder, type UseRuleBuilderOptions, useRuleBuilder } from './useRuleBuilder';

export type UseFilteredCollectionOptions<T> = Omit<UseRuleBuilderOptions, 'sourceValues'> & {
  /** The already-fetched collection to author against and filter. */
  rows: readonly T[];
  /** Passed through to `check` and source eligibility — feeds `{bind}` clauses. */
  checkOptions?: CheckOptions;
};

export type UseFilteredCollection<T> = UseRuleBuilder & {
  /** Rows matching the current cleaned rule. */
  data: T[];
};

/**
 * Headless rule builder over a collection in hand: `useRuleBuilder` plus the
 * in-memory half of the rules duality. The builder owns the one Condition;
 * sourced fields' option sets materialize from the rows themselves
 * (`sourceValuesFromRows` — declare `sources` on the source's narrowing and a
 * plain column becomes a pseudo-enum picker of the values that actually occur);
 * `data` is the rows passing the emitted (coercion-stamped) rule via `check()`.
 * For collections fetched whole — a calendar range, a Kanban board — where the
 * server owns scope and the narrowing is display-only. `source`, `rows`, and
 * `checkOptions` must be referentially stable (memoize at the call site).
 */
export const useFilteredCollection = <T extends Record<string, unknown>>(
  opts: UseFilteredCollectionOptions<T>,
): UseFilteredCollection<T> => {
  const { rows, checkOptions, ...builderOpts } = opts;

  const sourceValues = useMemo(
    () => sourceValuesFromRows(composeNarrowed(opts.source), rows, checkOptions),
    [opts.source, rows, checkOptions],
  );

  const builder = useRuleBuilder({ ...builderOpts, sourceValues });

  const data = useMemo(
    () => rows.filter((row) => check(builder.value, row, checkOptions) === true),
    [rows, builder.value, checkOptions],
  );

  return { ...builder, data };
};
