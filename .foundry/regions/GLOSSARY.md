# rules-builder glossary

**Every term rules-builder's region Wardens use, alphabetical, each with the region that holds it.**

<!-- Generated with the region Warden docs by the region pipeline's assemble.py. A term defined by two regions appears once per region. -->

---

## A

**ActionPath**  
A path into an ActionRule tree, used by getActionNode, setActionNode, addActionChild and removeActionNode. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**actionRoot**  
usePermissionBuilder's function returning the ActionRuleNode tree for one resource.action. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**ActionRule**  
One action's rule: a delegate string, { rel, action }, { self }, { rule }, { any }, { all }, a boolean, or null. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**ActionRuleKind**  
The kind of an ActionRule: rule, self, rel, delegate, any, all, allow or deny. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**ActionRuleNode**  
The descriptor tree for an ActionRule (ActionGroupNode / ActionLeafNode) with a switchable kind control. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**AggregateControl**  
sum/avg aggregate control on an ArrayNode; aggregate windows are offered only where targets accept them. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

**allow / deny**  
The boolean ActionRule kinds: always allow or always deny. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**any / all**  
Group ActionRule kinds: allowed when any child, or all children, allow. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**array-rules-scope-refs**  
Class: ArrayNode presence/count/predicate, nested condition/filter, aggregates and $./$$./$$$. scope refs. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

**arrayOperator.hidden**  
Traversal operators on faceted array nodes: editable but hidden. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**asRoot**  
Turns an undefined condition into a blank group or scaffold; does not handle null. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

**atomic**  
GroupNode/LeafNode/ArrayNode.atomic: a preset node with no field/operator/value pickers. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

## B

**Branch facet**  
Path ends at a to-one relation; seeds a scoped group whose picker emits dotted paths. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**BuilderField**  
One selectable field: kind, operators, enumValues/enumLabels, options, groupBy, relation target, aggregatable, compilesToPrisma, acceptsSubPath. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**builderSource**  
A lens in hand as a source: model-keyed surface plus one layer spelling what each path shows; no clamp, no bridge. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

## C

**coerceRule**  
json-rules coercion of widget values ("true", "42") to the field's type. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

**Collection facet**  
Path crosses a list relation; seeds a top-level array node. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**createView**  
The same view over a lens or narrowing already in hand. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

## D

**data**  
useFilteredCollection's rows passing check() for the emitted rule. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

**Decoration**  
{facets, models, labels}: presentational hoisting and relabeling over the lens; the lens stays the source of truth. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**decoration-facets**  
Class: path facets, labels, the two wheres, kind retype, move-not-copy, rehydration and validation. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**Decoration.models**  
Facets keyed map:Model or Model, applied at that model's array condition surfaces. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**defaultWhere**  
One editable ArrayOperator per array boundary the path crosses, default any; never matched. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**delegate**  
ActionRule kind (a string) deferring to a sibling action of the same resource. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**describeRule**  
json-rules description behind describe(): sources touched, bridges, valid targets. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

**descriptor-tree**  
Class: buildRoot/asRoot and the GroupNode/LeafNode/ArrayNode descriptors with bound actions. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

## E

**emptyAction**  
A new transition Action holding a single empty edge. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**engineGlobals**  
json-rules globals holding rulesBuilder.filter.caseInsensitive (true) and rulesBuilder.filter.fuzzy defaults. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

## F

**Facet**  
One root-picker entry: a path (path facet) or a condition (preset), with label, icon, where, defaultWhere, kind, selectors. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**FacetCondition**  
A Condition whose rules may carry variable; a plain Condition is one. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**facetId**  
A facet's identity; erases defaults, so presets differing only by default collide. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**facetMode**  
{ value: 'faceted' | 'raw', set } on a governed node; raw suspends recognition for the session. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**field-surface**  
Class: what one scope offers, as BuilderField[] plus the value shape per operator. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**FieldControl / OperatorControl / ValueControl**  
A leaf's pickers: value, options, set; ValueControl adds mode, shape, kind. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

**filtered-collection**  
Class: useFilteredCollection over rows in hand, returning data, the rows passing check(). *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

## G

**gate**  
validateRuleInLens on the narrowed lens plus validateRule on each target. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

**groupBy partition pinning**  
A grouped sourced field's options follow the partition its conjoined sibling clauses select. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**GroupNode / LeafNode / ArrayNode**  
Descriptor node kinds: compound group, field rule, list/relation rule. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

## H

**hoist**  
Marker on a node governed by a facet, so a renderer can show its tag. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

## K

**kind**  
Facet retype of an untyped EAV value column so its operators are right. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

## L

**Leaf facet**  
Path ends at a scalar/enum; emits { field: path }. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**lens-pickers**  
Class: lens walks for consumers outside the rule tree (lensValuePicker, lensScopeSurface and their hooks). *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**LensView**  
{lens, mapName, model, visit(at)}: what the builder reads; each visit resolved on demand through json-rules lensVisit. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**loops**  
lensScopeSurface's to-many relations, emitted as portals instead of walked; a loop's scope is { at: loop.at }. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

## M

**mapDefaults**  
Narrowing spelling that turns a model's relations on wherever it is visited, once at nearest reach. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**matchFacet / stampFacetIds**  
Recognise a node's facet; pin it as __facetId meta for the session. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**materializeSources**  
json-rules function that computes sourceValues from rows already in hand. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**MergeStrategy**  
to.merge: spread, deepMerge, append or appendUnique, read with mergeOf and written with setMerge. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**move, not copy**  
A facet consuming a top-level field wholesale removes it from the root (consumedTopFields). *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

## N

**narrowed lens**  
composeNarrowed(source), also view.lens and useRuleBuilder().lens: the gate every rule is validated against. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**narrowing**  
One parent-less layer or a list of them, outermost first, each narrowing the one before; the first turns relations on. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**normalizeGroups**  
Puts a tree in the builder's shape, so X and { all: [X] } compare equal. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

## P

**package-overview**  
Class: what the package is, its peers, the source -> view -> gate flow, the layers by file and the API list. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**permission-builder**  
Class: usePermissionBuilder, useActionRuleBuilder, buildActionRoot and the ActionRule tree and schema helpers. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**permissionActions**  
useTransitionBuilder option: the permission schema's actions per resource, for delegate/rel on a side's permission. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**permissionRoot**  
useTransitionBuilder's function returning a side's optional ActionRule descriptor; enablePermission / clearPermission toggle it. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**predicateRoot**  
useTransitionBuilder's function returning a side's condition descriptor (via buildRoot). *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**preset**  
A facet with `condition`: a complete rule inserted as one atomic node. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**preset-variables**  
Class: preset facets as atomic nodes with Variable value slots. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

## R

**rawView**  
The raw-record view with every relation on, which permissions and transitions gate. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**rawView**  
The view with every relation on; permission and transition surfaces are built over it, not a narrowed lens. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**RebacSchema**  
@inixiative/permissions schema { bridges?, permissions: { 'map:Model': { actions } } }, re-declared in this package. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**rehydration**  
matchFacet collapses a saved raw node back to its named facet. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**rel**  
ActionRule kind: walk relation hops, then require a target action on the related record. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**resolve**  
resolve(source, { sourceValues }): the LensView of a serializable source. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**ResourcePermission**  
One resource's entry in RebacSchema.permissions: its named actions and their rules. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**root.relations**  
Narrowing spelling that turns relations on along a path from the anchor. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**rule (abac)**  
ActionRule kind embedding a json-rules condition builder: an attribute-based check. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**rule-builder-hook**  
Class: useRuleBuilder, its options and return, the gate, coercion, description and per-control validity. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

**RuleBuilderSource**  
Serializable {maps, bridges?, mapName, model, narrowing?}: what a server ships the builder. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**RulePath**  
Node address by segments: child index, if/then/else, condition, filter. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

## S

**saved-rule-serialization**  
Class: persisting a rule with its binding as a SavedRule. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**SavedRule**  
{source, rule, sourceValues?}: a rule packaged with its binding for storage. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**scope refs**  
$. the current element, $$. the enclosing array's element, $$$. the one outside that; offered via LeafNode.scopes and value.path.scopes. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

**selectors**  
Path-facet inner rows drawn as dedicated dropdowns, carried as selectorClauses on the matched node. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**selectors-facet-mode**  
Class: per-model facets, selectors, groupBy partition pinning and the faceted/raw toggle. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**self**  
ActionRule kind { self: field }: allowed when the record's field equals the actor's id. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**siblingActions / actionsByResource**  
useActionRuleBuilder options giving delegate and rel rules the action names they can target. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**SideKey**  
Which side of an edge: 'from' or 'to'. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**source-and-view**  
Class: RuleBuilderSource, narrowing layers, composeNarrowed, resolve/createView/rawView and scope addressing. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**sourced-values**  
Class: data-backed field options from narrowing sources, materialized by json-rules and passed as sourceValues. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**sources**  
Narrowing entry declaring a field whose options are the distinct values of its column after an eligibility where. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**sourceValues**  
Fetched option sets passed to resolve/useRuleBuilder; they ride the visit at their own path only. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

## T

**tagged-sources**  
Class: one physical relation split into tagged logical sources by leading where slices. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**targets**  
The json-rules targets (default check) whose operator sets are intersected and that validate each rule. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**targets**  
json-rules compile targets (default check) that validate each rule and intersect operator sets. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

**toSourceQueries / materializeSourceQuery**  
json-rules functions that compile sourced-field queries and turn their results into sourceValues. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**Transition**  
One edge { from, to } of an action; each side holds a predicate and an optional permission. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**transition-builder**  
Class: useTransitionBuilder over a TransitionMap, its per-side roots, the to.merge strategy and emptyAction. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**TransitionMap**  
@inixiative/transitions schema: resource -> action -> { paths: [{ from, to }], label? }, re-declared here. *Region:* [Permission and transition builders](permission-and-transition-builders/knowledge.md)

**tree-edits**  
Class: pure path-addressed Condition edits and editor metadata in src/core. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

## U

**useRuleBuilder**  
The hook returning {value, root, lens, view, setCondition, validate, describe}. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

## V

**valid**  
Per-control validity flag on the row, field and value controls. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

**validateDecoration**  
Returns violations: unresolvable paths, duplicate ids, non-prefix-free wheres on one target. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**value**  
coerceRule(stripMeta(trimEmptyGroups(tree))): the clean Condition the hook emits. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

**ValueControl mode**  
value | path | bind: a literal, another column, or a server-filled binding. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)

**ValueShape**  
The json-rules value an operator expects (scalar, array, range, dateWindow, predicate, none ...), mapped to a slot. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**Variable**  
A preset value slot's domain {default?, options?, range?}, in the value-source position. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**VariableControl**  
{path, field, label, variable, options, value}: one slot's control on an atomic node. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**viewRoot / viewAt**  
The anchor scope of a view, and that scope moved down a dotted relation path. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**visitOf**  
The visit a scope sits on, or undefined where the lens shows nothing. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

## W

**where**  
A facet's fixed, non-editable identity condition on the destination model; the only thing rehydration matches. *Region:* [Decoration: facets and presets](decoration-facets-and-presets/knowledge.md)

**withAllRelations**  
Turns every relation on in a source's first layer, keeping later layers' narrowing. *Region:* [Lens sources, views and field surfaces](lens-sources-and-surfaces/knowledge.md)

**withIds / stripMeta**  
Stamp __groupId/__id editor meta, and drop every _-prefixed key before saving. *Region:* [Rule builder hook and condition tree](rule-builder-and-condition-tree/knowledge.md)
