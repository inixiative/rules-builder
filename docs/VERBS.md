# Verbs

Every operation rules-builder performs has one verb, one public name per thing it applies to, and
one implementation. `test/verbs.test.ts` fails when an exported function is missing here. The
verbs below rules-builder (evaluate, validate, describe, compose a lens) are json-rules'
([`json-rules/docs/VERBS.md`](https://github.com/inixiative/json-rules/blob/main/docs/VERBS.md));
rules-builder calls them and never re-implements them.

The builder is headless: a `build*Root` turns a value into a descriptor tree whose actions compute
the next value and hand it to `commit`; a `use*Builder` hook owns the value and exposes that tree.

## Editors

| Verb | Name | What it does |
| --- | --- | --- |
| build | `buildRoot` | The descriptor tree of a condition authored in a view: groups, field leaves, array and aggregate rules, implications, literals; json-rules' issues placed on the node that reads the path. |
| build | `buildValueExpressionRoot` | The descriptor tree of a value expression (`evaluateValue`'s grammar): a node per value with its shape picker, inferred type and issues. |
| build | `buildCategorizationRoot` | The descriptor tree of a categorization (`categorize`): ordered cases (a condition root and a value root each), `match`, `default`. |
| build | `buildActionRoot` | The descriptor tree of a permissions action rule: allow, deny, delegate, `rel`, the list arm, groups and ABAC leaves. |
| build | `buildEntitlementGrantRoot` | The descriptor of an entitlement grant: its operations over the caller's tree, the positive conditions it adds beside the held ones, its narrowing checked by the caller. |
| own the value | `useRuleBuilder` | Headless editor for a condition over a lens source. |
| own the value | `useFilteredCollection` | `useRuleBuilder` over rows in hand, filtering them in memory with option sets materialized from the rows. |
| own the value | `useValueExpressionBuilder` | Headless editor for a value expression over a lens source. |
| own the value | `useCategorizationBuilder` | Headless editor for a categorization over a lens source; the preview is the caller's evaluator. |
| own the value | `useActionRuleBuilder` | Headless editor for one permissions action rule. |
| own the value | `usePermissionBuilder` | Headless editor for a whole permissions schema: resources, their actions, each action's rule. |
| own the value | `useTransitionBuilder` | Headless editor for a transitions schema, its actions and edges. |
| clean | `cleanValue`, `cleanCategorization` | A value expression or categorization as the editor emits it: metadata off, conditions coerced from the lens, aggregates stamped. |
| new | `emptyAction` | A new transition action: one empty edge. |
| new | `defaultActionRule` | A new permissions slot: an empty ABAC predicate. |
| classify | `isGroupNode`, `isArrayNode`, `isAggregateNode`, `isIfNode` | Which kind of condition a node is. |
| classify | `actionKind`, `isActionGroup` | Which kind of action rule a node is; whether it is `any` / `all`. |

## Condition and action trees

Paths address nodes on the builder's shape (`normalizeGroups`). Every edit returns a new tree.

| Verb | Name | What it does |
| --- | --- | --- |
| read | `getNode`, `getActionNode`, `valueAt` | The node at a path in a condition, an action rule or a value expression. |
| read | `childrenOfAction` | An action node's child slots: a group's members, or a list arm's `condition`. |
| read | `issuePathOf` | The JSON path json-rules reports a value's issues at. |
| write | `setNode`, `setActionNode`, `setValueAt` | The tree with the node at a path replaced. |
| add | `addRule`, `addActionChild` | The tree with a child added under a group. |
| remove | `removeNode`, `removeActionNode` | The tree without the node at a path. |
| group | `groupSiblings`, `wrapInCompound`, `unwrapCompound`, `switchGroupOperator` | Gather siblings into a new `all` / `any`, wrap one node, lift a group's children into its place, flip `all` ↔ `any`. |
| shape | `asRoot`, `asGroupRoot`, `normalizeGroups` | The root a condition is built from; a sub-condition as a group; every array rule's `condition` / `filter` as a group. |
| shape | `trimEmptyGroups` | Drop empty groups. |
| mark | `withIds`, `stripMeta` | Stamp editor ids on every node; take editor metadata off. |
| schema | `setSchemaAction`, `removeSchemaAction` | A permissions schema with one `resource.action` rule set or dropped. |
| schema | `actionNamesByResource` | Every resource's action names, for `delegate` and `rel` pickers. |

## The view a builder reads

| Verb | Name | What it does |
| --- | --- | --- |
| source | `builderSource` | The serializable source a builder authors against, read off a lens. |
| source | `withAllRelations` | A source with every relation turned on at the model defaults. |
| resolve | `resolve` | A source (and fetched `sourceValues`) resolved to the view: the narrowed lens and its path projection. |
| resolve | `composeNarrowed` | A source composed into its narrowed lens (the gate). |
| resolve | `createView`, `rawView` | A view over a lens or narrowing; the view of a raw record (every column and relation). |
| scope | `viewRoot`, `viewAt`, `visitOf` | The anchor's scope; the scope at a relation path; the visit a scope sits on. |
| describe | `describeScopeFields` | The selectable fields at one scope, exactly what the lens shows there. |
| describe | `describeModelFields` | A model's selectable fields unioned over its visits (prefer `describeScopeFields`). |
| describe | `lensScopeSurface`, `useLensScopeSurface` | What a lens shows at one scope, split into flat `values` and `loops`. |
| describe | `valueShapeForOperator` | The value input an operator takes. |

## Decorations (facets, labels, presets)

| Verb | Name | What it does |
| --- | --- | --- |
| describe | `describeFacets`, `useFacetFields` | A decoration's facets as builder fields beside the anchor surface. |
| describe | `branchFields`, `facetBranchScope`, `facetElementLeaf` | A branch facet's field surface and scope; an element leaf with its `kind` override. |
| describe | `modelDecor`, `modelFacets`, `decorationSurfaceOptions`, `relabelRelations` | A model's label and icon, its facets, the decoration's labels as `SurfaceOptions`, relations relabeled by target. |
| match | `matchFacet`, `scopedDecoration`, `selectorsApply`, `isPreset` | The facet a node matches; the decoration a nested scope matches against; whether a facet's selectors apply; whether it is a preset. |
| identify | `facetId`, `scopedFacetId`, `stampFacetIds` | A facet's stable id; scope-qualified; stamped onto every recognizable node. |
| count | `leadingWhereCount`, `leadingIdentityCount`, `consumedTopFields` | How many leading conditions are a facet's identity; the top fields a decoration consumes wholesale. |
| read | `whereConditions`, `variableSlots`, `presetSeed` | A `where` as its leading conditions; a preset's variable slots; the condition a preset inserts. |
| write | `writeSelectorClause` | Write a selector clause into a facet's block (the one write site). |
| validate | `validateDecoration` | The violations that would let facets collide on rehydration. |

## Saved rules

| Verb | Name | What it does |
| --- | --- | --- |
| parse | `parseSavedRule` | Parse and structurally validate a saved rule; throws on malformed input. |
| serialize | `stringifySavedRule` | Serialize a saved rule. |
