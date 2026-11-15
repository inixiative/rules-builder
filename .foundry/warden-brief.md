# rules-builder, for its Wardens

rules-builder (`@inixiative/rules-builder`) is a published, headless React rule builder for
`@inixiative/json-rules`. It edits a json-rules `Condition` against a lens and offers only what the
lens shows and the json-rules operator catalog defines, so a user can only build a rule the engine
can run. It renders nothing: the hooks return descriptor trees with bound actions, and consumers
bring their own components.

## Shape of the repository

- Two entries: `.` (`src/index.ts`, re-exporting every module) and `./schema`
  (`src/schema/index.ts`). All source is `.ts`.
- `src/schema/surface.ts`: sources (`RuleBuilderSource`, `builderSource`, `withAllRelations`),
  views (`resolve`, `createView`, `rawView`, visits through json-rules `lensVisit`) and the field
  surface (`describeScopeFields`, `BuilderField`, `valueShapeForOperator`).
- `src/schema/decoration.ts`: the presentational `Decoration` (facets, presets and variables,
  per-model facets, selectors, labels, rehydration, `validateDecoration`).
- `src/builder/`: `buildRoot` (the descriptor tree), `useRuleBuilder`, `useFilteredCollection`.
- `src/core/`: pure path-addressed tree edits and editor metadata (`withIds`, `stripMeta`).
- `src/permissions/`, `src/transitions/`: builders for `@inixiative/permissions` and
  `@inixiative/transitions` schemas, with those packages' types re-declared here.
- `src/serialize.ts`: `SavedRule`. `examples/`: the Vite playground and copy-paste renderers, not
  exported. Docs: `README.md`, `PLAN.md` (architecture), `docs/OPEN_QUESTIONS.md`.
- Check: `bun run check` (typecheck, examples typecheck, `biome check .`, `bun test`).

## Rules that hold everywhere

- The narrowed lens is the gate. Every rule is checked by `validateRuleInLens` plus json-rules
  `validateRule` on each of the builder's `targets`, never against a projected surface. Don't
  re-implement an engine rule here; defer to json-rules.
- A decoration is presentation only. A facet emits its real dotted path, and the emitted rule is
  exactly what the engine runs.
- The package depends only on json-rules and React. Permission and transition types are copies.
- Editor metadata keys are `__`-prefixed and stripped before `value` emits.
- Breaking changes are hard cuts with no compatibility path while there are no users.

## Words used here

lens, narrowing, layer, source, view, visit, scope, anchor, gate, target, descriptor, field
surface, sourced field, `sourceValues`, facet, preset, variable, `where`, `defaultWhere`, hoist,
rehydration, selector, facet mode, scope ref, `ActionRule`, `RebacSchema`, `TransitionMap`.
