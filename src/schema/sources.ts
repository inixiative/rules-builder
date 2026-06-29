import { check, type Lens, type LensNarrowing, type SourceValues, sourceQueries } from '@inixiative/json-rules';

export type { SourceValues } from '@inixiative/json-rules';

/** Rows the app already has in memory, keyed by model name. */
export type SourceRows = Record<string, Record<string, unknown>[]>;

/**
 * Run a lens/narrowing's compiled source queries over in-memory rows: filter each
 * by the composed `where` via `check()`, then DISTINCT the column. This is the
 * "fetch then filter through the rules" step the engine leaves to the app — the
 * result is the `sourceValues` you hand back to `resolve`/`useRuleBuilder` so a
 * sourced field becomes a constrained option set (a pseudo-enum).
 *
 * Real apps run the compiled query (`toSql`/`toPrisma`) against a database; this
 * is the same shape over local rows.
 */
export const runSources = (lensOrNarrowing: Lens | LensNarrowing, rows: SourceRows): SourceValues[] =>
  sourceQueries(lensOrNarrowing).map((q) => {
    const matched = (rows[q.model] ?? []).filter((r) => check(q.composedWhere, r) === true);
    const seen = new Set<string>();
    const values: string[] = [];
    for (const r of matched) {
      const raw = r[q.field];
      if (raw == null) continue;
      const v = String(raw);
      if (!seen.has(v)) {
        seen.add(v);
        values.push(v);
      }
    }
    return {
      path: q.path,
      mapName: q.mapName,
      model: q.model,
      field: q.field,
      values,
    };
  });
