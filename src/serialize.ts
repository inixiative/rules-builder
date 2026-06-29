import type { Condition, SourceValues } from '@inixiative/json-rules';

/**
 * A rule packaged for storage/transport: the `rule` itself, a `source` reference
 * binding it to the lens/narrowing it was authored against, and the `sourceValues`
 * captured at author time so data-backed (sourced) option sets survive a round-trip
 * without re-querying.
 *
 * `source` is generic: a self-contained app passes a `RuleBuilderSource`; an app
 * with a registry of named lenses/narrowings passes its own by-name ref. The
 * library only owns the envelope and validates its structure on parse.
 */
export type SavedRule<TSource = unknown> = {
  source: TSource;
  rule: Condition;
  sourceValues?: SourceValues[];
};

/** Serialize a SavedRule. Pretty-prints (indent 2) by default. */
export const stringifySavedRule = <TSource>(saved: SavedRule<TSource>, space: number = 2): string =>
  JSON.stringify(saved, null, space);

/** Parse + structurally validate a SavedRule. Throws on malformed input. */
export const parseSavedRule = <TSource = unknown>(json: string): SavedRule<TSource> => {
  const data: unknown = JSON.parse(json);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('SavedRule must be a JSON object');
  }
  const rec = data as Record<string, unknown>;
  if (!('rule' in rec)) throw new Error('SavedRule.rule is required');
  if (!('source' in rec) || rec.source == null) throw new Error('SavedRule.source is required');
  if ('sourceValues' in rec && rec.sourceValues !== undefined && !Array.isArray(rec.sourceValues)) {
    throw new Error('SavedRule.sourceValues must be an array when present');
  }
  return rec as SavedRule<TSource>;
};
