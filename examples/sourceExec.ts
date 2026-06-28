import { check, type Lens, type LensNarrowing, type SourceValues, sourceQueries } from '@inixiative/json-rules';

export type { SourceValues } from '@inixiative/json-rules';

type Row = Record<string, unknown>;

/** Run each compiled source query against in-memory rows: filter by the composed
 *  where via check(), then DISTINCT the field. This is the "fetch then filter
 *  through the rules" step the engine leaves to the app. Sources live in the
 *  lens's narrowing (`narrowing.sources`), so this runs over the composed lens. */
export const runSources = (
  lensOrNarrowing: Lens | LensNarrowing,
  rows: Record<string, Row[]>,
): SourceValues[] =>
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
    return { path: q.path, mapName: q.mapName, model: q.model, field: q.field, values };
  });
