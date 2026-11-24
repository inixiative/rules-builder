# Rules Builder: architecture

Headless visual rule builder for [`@inixiative/json-rules`](https://github.com/inixiative/json-rules).
It edits a json-rules `Condition` against a **lens**, without writing JSON. The builder
defines no field-type or operator registry of its own: it reads json-rules' lens and
operator catalog directly, so it can only offer what the engine can run.

## The flow

1. The server narrows a lens and hands the builder a serializable **source**
   (`RuleBuilderSource`): maps, `mapName`, `model` (the anchor), optional `bridges`, and
   parent-less `narrowing` layers. Relations are off until the first layer turns them on
   (json-rules 3.4 and later). `builderSource(lens, { sourceValues })` turns a lens in hand
   into such a source.
2. The builder reads the source as a **view** (`resolve(source, { sourceValues })`, or
   `createView` over a lens in hand): the narrowed lens (`view.lens`) plus `view.visit(at)`,
   each visit resolved on demand through json-rules `lensVisit`. Each scope reads the fields
   the lens shows on that path. Nothing is enumerated up front.
3. Each rule is gated by `validateRuleInLens` against the narrowed lens and by json-rules
   `validateRule` on every configured target (default `check`). It is coerced by
   `coerceRule` and described by `describeRule` (sources touched, bridges crossed, valid
   targets). A `projectLens(…, { by: 'model' })` surface turns no relation on, so it is
   never the gate.

## Layers

- **`src/schema/surface.ts`**: sources and views. `composeNarrowed`, `builderSource`,
  `withAllRelations`, `resolve`, `createView`, `rawView` (every relation on, the raw record
  that permissions and transitions gate), `viewRoot` / `viewAt`, and
  `describeScopeFields` / `describeModelFields`, which return `BuilderField[]`: each
  field's kind, its operators (intersected across `targets`), enum or sourced values,
  `groupBy` axes, and its relation target. `valueShapeForOperator` gives the value slot
  to render.
- **`src/schema/decoration.ts`**: the presentational `Decoration`. Path and preset facets
  hoisted to the root selector, per-model facets (`models`), relabeling (`labels`), preset
  variables, and inner `selectors`. Also the pure functions behind them:
  `describeFacets`, `matchFacet` (rehydration), `presetSeed`, `variableSlots`,
  `consumedTopFields`, `decorationSurfaceOptions`, and `validateDecoration`, which keeps
  facets collision-free.
- **`src/schema/lensValuePicker.ts`, `src/schema/lensScopeSurface.ts`**: lens walks for
  consumers outside the rule tree. `lensValuePicker` lists the value locations reachable
  to `maxDepth` hops. `lensScopeSurface` splits one scope into flat `values` (through
  to-one relations) and to-many `loops`.
- **`src/core/tree.ts`, `src/core/decorate.ts`**: pure, immutable, path-addressed
  `Condition` edits (`getNode`, `setNode`, `addRule`, `removeNode`, `wrapInCompound`,
  `groupSiblings`, `unwrapCompound`, `normalizeGroups`) and editor metadata
  (`withIds`, `stripMeta`, `trimEmptyGroups`, `switchGroupOperator`).
- **`src/builder/`**: `buildRoot` turns a condition, a view and its fields into the
  descriptor tree (`GroupNode`, `LeafNode`, `ArrayNode`) with bound actions.
  `useRuleBuilder` owns the condition and emits a clean `value`.
  `useFilteredCollection` adds the in-memory half: options from the rows in hand, and
  `data` filtered by `check`.
- **`src/permissions/`, `src/transitions/`**: schema-level builders for
  `@inixiative/permissions` (`ActionRule`, `SchemaMap`) and `@inixiative/transitions`
  (`TransitionMap`). Their types are re-declared here, so the package depends only on
  json-rules. The `rule` leaves and transition predicates embed the condition builder over
  `rawView`.
- **`src/serialize.ts`**: `SavedRule` (a rule with its `source` reference and captured
  `sourceValues`), via `stringifySavedRule` / `parseSavedRule`.

The reference renderers (`examples/RuleTree.tsx`, `examples/RuleTreeShadcn.tsx`,
`examples/ActionRuleTree.tsx`) and the lifecycle playground (`examples/App.tsx`) are
copy-paste references. They are not exported.

## Slot value shapes

`valueShapeForOperator(operator, family)` returns the json-rules `ValueShape` an operator
expects, and the renderer maps it to a slot:

- `scalar` / `ordered`: an input;
- `string` / `pattern`: a text input;
- `array`: a multiselect;
- `range` / `dateRange`: two inputs;
- `dateValue`: a date picker;
- `dateWindow`: a relative or period picker;
- `dayList`: a weekday multiselect;
- `count`: a number plus a nested predicate;
- `predicate`: a nested condition builder;
- `none`: no input.

Design history (the hydration seam that `sourceValues` replaced, and the playground
design) is in `docs/plans/` and `CHANGELOG.md`.
