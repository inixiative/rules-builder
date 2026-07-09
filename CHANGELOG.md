# Changelog

## 0.17.0 — configurable `empty` scaffold; `setCondition(undefined)` clears

- **`useRuleBuilder({ empty })`** — what an absent `defaultValue` seeds to, replacing the hardcoded `{ all: [] }` (still the default). Lets a consumer scaffold a shaped blank builder — e.g. segments seeding `{ any: [{ all: [] }, { field: 'uuid', operator: 'in', value: [] }] }` for "rule-matched OR hand-picked members". Threads through `useFilteredCollection` via the shared options.
- **`setCondition(undefined)`** reseeds to `empty` — the "clear" gesture, symmetric with the mount seed. `asRoot` gains the `empty` parameter.
- Absence stays `undefined`-only, deliberately: a `null` from a DB row is the caller's to normalize at its own boundary, not a symbol the builder legitimizes (documented on `asRoot`).

## 0.16.0 — `useFilteredCollection` string-match defaults (case-insensitive + slight fuzzy)

- `UseFilteredCollectionOptions` now extends the engine's string settings (`Partial<EngineGlobalsState['string']>` — `caseInsensitive?`, `fuzzy?`), and the filter pass applies them via `engineGlobals.with({ string }, …)`. Defaults to **case-insensitive + slight typo-tolerance** (`{ caseInsensitive: true, fuzzy: { maxRatio: 0.2, maxDistance: 1 } }`): client search shrugs off casing and a single-char typo without any per-rule flags. Override per call (`{ fuzzy: false }` for exact). The override is scoped to the synchronous filter pass — global engine config is untouched. Requires `@inixiative/json-rules@^2.16.0`.

## 0.15.0 — `useFilteredCollection`: the headless builder over a collection in hand

- **`useFilteredCollection({ ...builderOpts, rows, checkOptions? })`** composes `useRuleBuilder` with the in-memory half of the rules duality, for collections fetched whole (calendar ranges, Kanban boards) where the server owns scope and the narrowing is display-only. One `Condition` owner (the builder), one option-folding seam (sourced fields materialize from the rows via json-rules 2.14's `sourceValuesFromRows`, folded through the builder's own `resolve`), stamp-once (the emitted `value` is already coercion-stamped; `data` is `rows.filter(check(value))`). Supersedes per-app filter hooks that double-owned the rule and double-folded `sourceValues` (`@template/ui`'s `useFilteredData`).
- `useRuleBuilder`'s `value` is memoized (was re-minted every render), so downstream `data`/effect memos keyed on it hold.
- `composeNarrowed(source)` extracted from `resolve` — the narrowed lens pre-projection, shared by the projection and the row materializer.
- Peer floor raised to `@inixiative/json-rules@^2.14.0` (`sourceValuesFromRows`).

## 0.14.1 — json-rules ^2.13.1 floor (deterministic DateTime coercion)

- Dependency floor raised to `@inixiative/json-rules@^2.13.1`: naive datetime strings anchor UTC during `coerceType: 'DateTime'` evaluation (2.13.0's tarball missed the fix).

## 0.14.0 — emit coercion-stamped rules (json-rules 2.13 `coerceType`)

- **`useRuleBuilder` emits coercion-stamped rules.** The cleaned output (`value`, `onChange`, `validate`, `describe`) runs json-rules 2.13's `stampCoercions` against the composed lens, so every field rule carries `coerceType` from its field kind — `check()` then compares widget-authored values (date strings, stringified numbers/booleans) against wire-format rows with no type inference. Array/aggregate nested conditions stamp against the related model; a seeded `coerceType` is preserved. Requires `@inixiative/json-rules@^2.13.0`.
- Not yet stamped: the permission/transition algebras' ABAC `rule` leaves (`useActionRuleBuilder`, `usePermissionBuilder`, `useTransitionBuilder`) — their leaves re-anchor on per-resource lenses, so stamping belongs at the leaf commit with the leaf's own lens.

## 0.13.0 — bind value-source, json-rules 2.12 option adoption, hooks tested

- **Bind value-source in the rule builder** + reference renderers: a rule value can bind to context (the `{ bind }` value source), surfaced by the copy-paste reference renderers.
- **Adopt json-rules 2.12's labeled option sets.** `runSources` emits `SourceValues.options` (`{ value, label? }[]`) instead of `values: string[]`, and `describeModelFields` reads a field's selectable set from `entry.options` (folded via json-rules), so sourced fields carry human labels in the picker. The example's narrowing editor handles the `Condition | SourceSpec` union. Requires `@inixiative/json-rules@^2.12.1`.
- **Fix:** calling `remove()` on a bare array-root node no longer throws (`removeNode: cannot remove the root`) — it clears to the empty group, mirroring the leaf-root behavior. Also fixes the junk `"undefined"` node id at the array root.
- **Tests:** lifecycle coverage for all five hooks (`useRuleBuilder`, `useActionRuleBuilder`, `usePermissionBuilder`, `useTransitionBuilder`, `useLensValuePicker`) — seed-once/controlled semantics, `onChange` suppression, descriptor-tree actions, and memo stability (+42 tests, 176 total).
