import {
  check,
  type Condition,
  createLens,
  type FieldMap,
  type Lens,
  type LensNarrowing,
  type ModelDefaultNarrowing,
  type SourceValues,
  sourceQueries,
} from '@inixiative/json-rules';

export type { SourceValues } from '@inixiative/json-rules';

/** A declared source: a field whose options come from the DISTINCT values of a
 *  model column, filtered by an eligibility `where`. Rides in the narrowing. */
export type WorkspaceSource = { map: string; model: string; field: string; where: Condition };

type Row = Record<string, unknown>;

/** Fold declared sources into a narrowing's mapDefaults so sourceQueries() sees
 *  them on the model (the general layer; composes at every path). */
export const injectSources = (
  narrowing: Omit<LensNarrowing, 'parent'>,
  sources: WorkspaceSource[],
): Omit<LensNarrowing, 'parent'> => {
  if (!sources.length) return narrowing;
  const mapDefaults = structuredClone(narrowing.mapDefaults ?? {});
  for (const s of sources) {
    const map = (mapDefaults[s.map] ??= {});
    const models = (map.models ??= {});
    const model = (models[s.model] ??= {} as ModelDefaultNarrowing);
    (model.sources ??= {})[s.field] = s.where;
  }
  return { ...narrowing, mapDefaults };
};

/** Run each compiled source query against in-memory rows: filter by the composed
 *  where via check(), then DISTINCT the field. This is the "fetch then filter
 *  through the rules" step the engine leaves to the app. */
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

/** Compute every declared source independently, each anchored at its own model
 *  so it is always reachable (a global preview, ignoring any lens narrowing). */
export const computeAllSources = (
  maps: Record<string, FieldMap>,
  bridges: { endpoints: unknown }[] | undefined,
  sources: WorkspaceSource[],
  rows: Record<string, Row[]>,
): SourceValues[] =>
  sources.flatMap((s) => {
    const lens = createLens({
      maps,
      bridges: bridges as Lens['bridges'],
      mapName: s.map,
      model: s.model,
    });
    return runSources({ parent: lens, ...injectSources({}, [s]) }, rows);
  });
