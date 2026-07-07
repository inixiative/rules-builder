import {
  type CheckOptions,
  check,
  type EngineGlobalsState,
  engineGlobals,
  sourceValuesFromRows,
} from '@inixiative/json-rules';
import { useMemo } from 'react';
import { composeNarrowed } from '../schema/surface';
import { type UseRuleBuilder, type UseRuleBuilderOptions, useRuleBuilder } from './useRuleBuilder';

// Client search leans on the engine's string settings: case-insensitive and slightly
// typo-tolerant by default (short tokens exact, longer tolerate one edit). Override per call.
const DEFAULT_STRING_MATCH = {
  caseInsensitive: true,
  fuzzy: { maxRatio: 0.2, maxDistance: 1 },
} satisfies EngineGlobalsState['string'];

export type UseFilteredCollectionOptions<T> = Omit<UseRuleBuilderOptions, 'sourceValues'> & {
  /** The already-fetched collection to author against and filter. */
  rows: readonly T[];
  /** Passed through to `check` and source eligibility — feeds `{bind}` clauses. */
  checkOptions?: CheckOptions;
} & Partial<EngineGlobalsState['string']>;

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
  const { rows, checkOptions, caseInsensitive, fuzzy, ...builderOpts } = opts;

  const sourceValues = useMemo(
    () => sourceValuesFromRows(composeNarrowed(opts.source), rows, checkOptions),
    [opts.source, rows, checkOptions],
  );

  const builder = useRuleBuilder({ ...builderOpts, sourceValues });

  const stringMatch = useMemo(
    () => ({
      caseInsensitive: caseInsensitive ?? DEFAULT_STRING_MATCH.caseInsensitive,
      fuzzy: fuzzy ?? DEFAULT_STRING_MATCH.fuzzy,
    }),
    [caseInsensitive, fuzzy],
  );

  const data = useMemo(
    () =>
      engineGlobals.with({ string: stringMatch }, () =>
        rows.filter((row) => check(builder.value, row, checkOptions) === true),
      ),
    [rows, builder.value, checkOptions, stringMatch],
  );

  return { ...builder, data };
};
