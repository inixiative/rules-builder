# Rules Builder — Full-Lifecycle Demo + Hydration Primitive

**Date:** 2026-06-27
**Status:** Design (approved to write up)

## Goal

Two deliverables that together give the rules-builder **lib + demo** coverage over the
whole authoring lifecycle:

1. **Lib:** a hydration seam so a consumer can fetch a table's contents from the DB,
   drop the values into the payload sent to the builder, and have the targeted
   field(s) "take over" as pseudo-enums — no other wiring.
2. **Demo:** a polished tabbed example app that walks the full lifecycle —
   fieldmaps → bridges → lenses → builder — plus a hydration tab.

## The lifecycle (json-rules building blocks)

1. **FieldMap(s)** — per-source schema (`models{fields{kind,type,isList,values}} + enums`).
   Normally codegen output (PrismaMap-compatible); can be hand-authored or from other sources.
2. **Bridges** — cross-source edges (`endpoints:[{fieldMap,model,on}×2]` + `cardinality`).
   `stitchFieldMaps` injects a bridge field `"map:model"` on each endpoint model.
3. **Lens** — `createLens({maps, bridges, mapName, model})` anchors the stitched graph.
4. **Narrowing** — `picks/omits/enumPicks/enumOmits` (schema) + `where` (data), path-specific
   (`root`+`relations`) and applies-everywhere (`mapDefaults`).
5. **`exposedSurface(lensOrNarrowing)`** — collapses lens+narrowing into the safe surface to ship.
6. **Builder** — builds a `Condition` against the surface; `describeRule` + `checkRuleAgainstLens` classify/gate.

## Current state vs. gap

- `composeSurface(source)` (`src/schema/surface.ts`) already wires **maps + bridges + narrowing →
  createLens → exposedSurface**. Done + tested.
- `describeModelFields` surfaces fields, bridge fields, relations, per-target operators.
- React layer (`RuleBuilder`/`RuleGroup`/`RuleRow`/`useRuleBuilder`) exists.
- **Gap A (demo):** `examples/App.tsx` hardcodes one FieldMap, one map, one model, no bridges,
  no narrowing, no tabs — none of the authoring lifecycle is exercised.
- **Gap B (lib):** the pseudo-enum primitive (`FieldMapEntry.values`) exists and is fully wired
  (surface render + check-gating), but there is **no helper that projects table contents (data)
  onto a field's `values`** — i.e. no hydration seam.

## Hydration: the primitive already exists

A field's `values: readonly string[]` *is* the pseudo-enum primitive. Verified end-to-end:

- **Precedence:** `baseValues = entry.values ?? fieldMap.enums[type]` (`json-rules policy.ts:153`);
  documented as "Pass-through from codegen… Consumed by `checkRuleAgainstLens`" (`toPrisma/types.ts:17`).
- **Surface:** `exposedSurface` unions per-field `values` across visits (`exposedSurface.ts:21-29`);
  `enumPicks/enumOmits` narrow them (`policy.ts:155-164`).
- **Builder:** `describeModelFields` surfaces `values` as `enumValues`; `RuleRow.tsx:83` renders a
  `Select`/`MultiSelect`. Passing test at `surface.test.ts:82`.

**Decision — use the `kind:'enum'` shape.** Check-time value-gating only fires for
`walked.entry.kind === 'enum'` (`checkRule.ts:74,93`). To get *both* the select *and* engine
enforcement that the chosen value is in the set, a hydrated selector must be `kind:'enum'`
(with `type` = the source/table name). A `kind:'scalar'` field with `values` renders a select but
is **not** gated and keeps free-text operators — not what "pseudo-enum" means here.

So **nothing new is needed in json-rules.** Hydration = fill `field.values` (and ensure
`kind:'enum'`) from a table's rows.

## Lib addition: the hydration seam

New module `src/hydration/` exporting:

```ts
export type FieldHydration = {
  map: string;
  model: string;
  field: string;
  values: readonly string[];   // fetched from the DB (table contents)
  enumType?: string;           // optional override for entry.type; defaults to field name
};

export type Hydration = FieldHydration[];

// Pure, immutable. Clones maps; for each entry sets the target field to
// { kind: 'enum', values, type: enumType ?? <existing enum type> ?? field } —
// "takes over" the field (preserves a real enum field's type name).
export const hydrateFieldMaps = (
  maps: Record<string, FieldMap>,
  hydration: Hydration,
): Record<string, FieldMap> => { /* ... */ };
```

Wire it into the existing chokepoint so it "just works" through `<RuleBuilder source={...}/>`:

```ts
// RuleBuilderSource gains:
hydration?: Hydration;

// composeSurface applies it before createLens:
const maps = source.hydration ? hydrateFieldMaps(source.maps, source.hydration) : source.maps;
const lens = createLens({ maps, bridges: source.bridges, mapName: source.mapName, model: source.model });
return exposedSurface(source.narrowing ? { parent: lens, ...source.narrowing } : lens);
```

**Flow (the seam):** consumer `await fetchOptions()` → builds `Hydration` → passes `source.hydration`
→ `composeSurface` hydrates maps → `exposedSurface` → `describeModelFields` reports `enumValues`
→ `RuleRow` renders a select → `checkRuleAgainstLens` gates the value. No component changes.

**Semantics:** hydration **overrides** the schema for the targeted field (a plain `String` becomes
a gated enum select). Missing/unknown field path → throw (fail loud), consistent with `stitchFieldMaps`.

**Tests:** `hydrateFieldMaps` promotes a scalar to enum+values; idempotent merge with an existing
enum field; round-trips through `composeSurface` so `describeModelFields(...).enumValues` reflects the
fetched set; `checkRuleAgainstLens` rejects an out-of-set value on a hydrated field.

## Demo app: architecture

A single **ephemeral in-memory workspace** drives all tabs, with JSON import/export buttons (no persistence):

```ts
type Workspace = {
  maps: Record<string, FieldMap>;     // from samples or import
  bridges: Bridge[];                  // authored
  narrowings: Record<string, Omit<LensNarrowing,'parent'>>;  // saved lenses, by name
  hydration: Hydration;               // simulated DB fetch results
  rule: Condition;                    // current builder output
};
```

Tabs (one per lifecycle stage):

1. **Fieldmaps** — pick bundled multi-source samples (`app` + `crm`) + paste/import JSON; view
   models/fields/enums read-only.
2. **Bridges** — author bridges across maps (endpoint pickers: map→model→`on` field, cardinality);
   live `stitchFieldMaps` validation; show injected `"map:model"` bridge fields.
3. **Lenses** — full recursive narrowing editor (anchor map+model; per-field pick/omit; per-enum
   pick/omit; `where` via an **embedded `RuleBuilder`** — dogfood; relations drill-down tree;
   `mapDefaults`). Live `validateNarrowing` + `exposedSurface` preview. Save as a named lens.
4. **Hydration** — pick a field; supply values (a "Fetch from DB" button returns canned table
   contents to simulate the real seam); writes into `workspace.hydration`. Shows the field flagged
   as hydrated.
5. **Builder** — choose a saved lens; `composeSurface({maps, bridges, narrowing, hydration})` →
   `RuleBuilder`. Shows the `Condition` JSON, `describeRule` classification (sources, bridgesCrossed,
   supportedTargets), and `checkRuleAgainstLens` violations. **Classify only** (no `check()` execution,
   no toSql/toPrisma preview).

**Bundled samples:** an `app` map (User/Order…) + a `crm` map (Account/Contact…) so bridges connect
across sources, plus at least one hydration target (e.g. a `tier`/`tag` field whose options are
"fetched") to demonstrate a field taking over as a pseudo-enum.

## Scope

**In (MVP):** the hydration seam (`kind:'enum'` + `values` from data); all five tabs; ephemeral
workspace + JSON import/export; tests for the lib seam + demo workspace logic.

**Deferred (explicitly out for now):**
- Co-dependent hydration / dictionaries (a field's options depend on another field's value).
- Custom-field *definitions* (table rows becoming **new** fields, not just options).
- `check()` execution against sample data + `toSql`/`toPrisma` compile preview.
- Hydration of bridge-crossing (joined) source rows — unrelated mechanism (`buildBridgeDictionary`).

These layer on later as additional hydration *kinds*; they do not change the MVP seam.

## Build order

1. Lib: `hydration/` module + `RuleBuilderSource.hydration` + `composeSurface` wiring + tests.
2. Demo scaffold: workspace state, tab shell, persistence, bundled samples.
3. Fieldmaps + Builder tabs (smallest end-to-end loop, validates the seam visually).
4. Hydration tab.
5. Bridges tab.
6. Lenses tab (recursive editor — heaviest; can be split into root-only then relations/mapDefaults).

## Decisions (resolved)

- Persistence: **ephemeral in-memory + JSON import/export** (no localStorage).
- Build order: lib seam first, Lenses editor last. Done — all phases landed and
  browser-verified (hydrated field renders a gated select; saved lens narrows the builder).
