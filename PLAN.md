# Rules Builder

Headless visual rule builder for [`@inixiative/json-rules`](https://github.com/inixiative/json-rules).
Composes a json-rules `Condition` against a **lens**, without writing JSON.

> This plan supersedes the pre-lens (v0) design. The builder no longer defines its
> own field-type or operator registry — it consumes json-rules' lens surface and
> operator catalog directly.

## Architecture

The builder is driven by a **lens**, not a hand-written schema:

1. The server narrows a lens and produces an **exposed surface** with
   `exposedSurface(lensOrNarrowing)` (json-rules ≥ 2.8) — a `Lens` (maps intact,
   the navigable graph) containing only what the narrowing exposes. Never ship
   the raw lens.
2. The builder reads that surface for field metadata and the json-rules **operator
   catalog** for valid operators (target-aware), so it always matches what the
   engine can actually run.
3. A finished rule is classified with `describeRule(rule, lens)` (sources touched,
   bridges crossed ⇒ check-only, valid targets) and gated with
   `checkRuleAgainstLens` before execution.

### Layers

- **`schema/surface.ts`** — `describeModelFields(lens, mapName, modelName, opts)`
  → `BuilderField[]`: per-field kind, valid operators (intersected across the
  configured `targets`), enum values, and relation targets for drill-down.
  `valueShapeForOperator` drives which input slot to render. ✅ Done + tested.
- **`core/tree.ts`** — pure, immutable, path-addressed `Condition` mutations:
  `getNode` / `setNode` / `addRule` / `removeNode` / `wrapInCompound` /
  `unwrapCompound`. The state engine the UI sits on. ✅ Done + tested.
- **`builder/slots.ts`** — typed component-injection contracts. Consumers provide
  their own components (e.g. shadcn); the package ships contracts + an example
  set, not bundled UI. ✅ Contracts in place.

## Status

- ✅ Headless core: surface adapter + condition-tree engine (typechecked, tested).
- ✅ Slot contracts.
- ⏳ React layer: `useRuleBuilder` hook (wraps the tree engine + surface), recursive
  `RuleBuilder` / `ConditionRenderer`, value-vs-field-reference toggle, live
  validation badge via `describeRule` + `checkRuleAgainstLens`.
- ⏳ Example shadcn slot set + `testing/` slot contract test suite.
- ⏳ Preview panel running `check()` against sample data; hydration spec for
  bridge-crossing rules.

The React layer needs `react` installed and a DOM test harness, and is best built
once json-rules 2.8 is published so the dependency resolves from the registry.

## Slot value shapes

`valueShapeForOperator` returns the json-rules `ValueShape` an operator expects;
the renderer maps it to a slot: `scalar`/`ordered`→input, `string`→text,
`array`→multiselect, `range`/`dateRange`→two inputs, `dateValue`→date picker,
`dateWindow`→relative/period picker, `dayList`→weekday multiselect,
`count`→number + nested predicate, `predicate`→nested condition builder,
`none`→no input.
