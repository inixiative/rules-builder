# @inixiative/rules-builder

Headless visual rule builder for [@inixiative/json-rules](https://github.com/inixiative/json-rules).

Compose a json-rules `Condition` against a **lens** — driven by the lens's
exposed surface and the json-rules operator catalog, so the builder always offers
exactly what the engine can run. The hook renders nothing: you bring your own
components (or copy the reference renderers).

**Live demo:** [www.inixiative.com/rules-builder](https://www.inixiative.com/rules-builder/) — the lifecycle playground (fieldMaps → bridges → lenses → narrowings → sources → builder → value picker).

## Install

```bash
bun add @inixiative/rules-builder @inixiative/json-rules
```

`react` and `@inixiative/json-rules` are peer dependencies.

## Quick start

`useRuleBuilder` owns the `Condition` JSON and returns a **descriptor tree** — a
`root` group whose nodes carry the controls (field / operator / value), their
options, and bound actions. You walk the tree and render it however you like.

```tsx
import { useRuleBuilder, type BuilderNode, type GroupNode, type LeafNode } from '@inixiative/rules-builder';

const source = {
  maps: {
    app: {
      models: {
        User: {
          fields: {
            role: { kind: 'enum', type: 'UserRole' },
            age: { kind: 'scalar', type: 'Int' },
          },
        },
      },
      enums: { UserRole: ['admin', 'member', 'guest'] },
    },
  },
  mapName: 'app',
  model: 'User',
};

function RuleEditor() {
  const { root, value } = useRuleBuilder({ source, defaultValue: { all: [] } });
  return <Node node={root} />; // `value` is the clean, serializable Condition
}

function Node({ node }: { node: BuilderNode }) {
  if (node.kind === 'group') return <Group node={node} />;
  if (node.kind === 'array') return <ArrayRule node={node} />;
  return <Leaf node={node as LeafNode} />;
}

function Leaf({ node }: { node: LeafNode }) {
  const { field, operator, value } = node;
  return (
    <div>
      <select value={field.value} onChange={(e) => field.set(e.target.value)}>
        {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select value={operator.value} onChange={(e) => operator.set(e.target.value)}>
        {operator.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ValueField control={value} />
      <button onClick={node.remove}>✕</button>
    </div>
  );
}
```

### Rendering values

`useRuleBuilder` is headless — it does **not** render value inputs, because the
right input depends on the operator's `shape` and the field's `kind`. The
`ValueControl` gives you everything to switch on:

| Signal | Render |
| --- | --- |
| `control.options` present | a `<select>` / chips (enum or **sourced** field) |
| `control.shape === 'array'` | a multi-select (e.g. `in` / `notIn`) |
| `control.shape === 'range'` | two inputs (e.g. `between`) |
| `control.shape === 'none'` | no input (e.g. `isEmpty`) |
| `control.kind === 'Boolean'` | a true/false select — coerce to a real boolean |
| `control.kind === 'Int' \| 'Float'` | a number input — coerce with `Number()` |
| `control.kind === 'DateTime'` | a date input |

Coercion matters: store `true`, not `"true"`. The two reference renderers in the
demo — [`RuleTree.tsx`](./examples/RuleTree.tsx) (plain) and
[`RuleTreeShadcn.tsx`](./examples/RuleTreeShadcn.tsx) (shadcn/ui) — implement this
matrix in full. They're **copy-paste** (shadcn-style), not exported: drop one in
and adapt it.

### Per-control validity

Each `LeafNode` exposes `valid` (the whole row), and `field.valid` / `value.valid`
pinpoint which control is wrong (field doesn't resolve in the surface; value
falls outside an enum/sourced set) so you can mark the exact input.

## Sourced fields (data-backed options)

A narrowing can declare `sources` — a field whose option set is the DISTINCT
values of its own column (after an eligibility `where`). The engine compiles the
queries; your app runs them and hands the results back:

```ts
import { runSources, useRuleBuilder } from '@inixiative/rules-builder';

const sourceValues = runSources(narrowing, rows); // rows: { [model]: Record<string, unknown>[] }
useRuleBuilder({ source, sourceValues }); // sourced fields now render as selects
```

In production you run the compiled query (`toSql` / `toPrisma`) against your DB;
`runSources` is the same shape over in-memory rows.

## Filtering a collection in hand

For collections fetched whole — a calendar range, a Kanban board — where the
server owns scope and the narrowing is display-only, `useFilteredCollection`
composes the builder with the in-memory half of the rules duality. The builder
owns the one `Condition`; sourced fields' options materialize from the rows
themselves (a plain column becomes a pseudo-enum picker of the values that
actually occur); `data` is the rows passing the emitted rule via `check()`:

```ts
import { useFilteredCollection } from '@inixiative/rules-builder';

const { data, root, value, setCondition } = useFilteredCollection({
  source: { maps, mapName, model, narrowing: { root: { sources: { rewardType: true } } } },
  rows, // the fetched collection
});
```

Emitted rules are coercion-stamped from the lens, so widget-authored values
(date strings, stringified numbers) match wire-format rows. `source`, `rows`,
and `checkOptions` must be referentially stable — memoize them at the call site.

## Array (list/relation) rules

A list or relation field builds an `ArrayNode` — a predicate / count / presence
over its elements:

- **presence** — `empty` / `notEmpty`
- **count** — `atLeast` / `atMost` / `exactly` (+ a numeric `count`)
- **predicate** — `all` / `any` / `none` (+ a `condition` sub-builder)

`node.condition` and `node.filter` are nested `GroupNode`s scoped to the **related
model's** surface — author them exactly like the top-level tree.

## Display view — hoisting & relabeling

By default the root selector offers only the anchor model's own fields; to reach
anything else you traverse relations. A **`view`** pre-traverses for you: it moves
chosen lens locations *up* to the root selector and relabels them. It is purely
presentational — the lens stays the source of truth, and a hoisted entry emits its
real dotted path (bridges included) as the rule's `field`, so nothing the engine
runs changes.

```ts
import { useRuleBuilder, type LensView } from '@inixiative/rules-builder';

const view: LensView = {
  // any path from the anchor, additive to the anchor's own fields.
  // crosses `map:Model` bridge segments — reach other sources at the root.
  roots: [
    { path: 'salesforce:Contact.arr', label: 'Annual Revenue', icon: '💰' },
    { path: 'account.industry', label: 'Industry' },
  ],
  // relabel keyed structurally (`Model.field`) or by path — path wins on conflict.
  labels: {
    fields: { 'account.industry': { label: 'Industry' } },
    values: { tier: { gold: { label: 'Gold tier' } } },
  },
};

useRuleBuilder({ source, view }); // hoisted entries now appear in the root selector
```

A `roots` entry pointing at a scalar/enum becomes a directly rule-able field
(operators, enum values, JSON sub-path all resolved from the lens). `describeHoistedFields`
is the pure function behind it; `viewSurfaceOptions` folds the view's labels into
the plain surface. Absent `view`, behavior is unchanged.

## Serialization

A rule loses meaning without its binding. `SavedRule` packages the rule with a
`source` reference and the captured `sourceValues`:

```ts
import { parseSavedRule, stringifySavedRule, type SavedRule } from '@inixiative/rules-builder';

const json = stringifySavedRule({ source: ref, rule, sourceValues });
const back = parseSavedRule(json); // validated; throws on malformed input
```

`source` is generic — a self-contained app stores a `RuleBuilderSource`; an app
with a registry stores its own by-name reference.

## API

- `useRuleBuilder(opts)` → `{ value, root, lens, setCondition, validate, describe }`
- `useFilteredCollection({ ...opts, rows, checkOptions? })` → the same surface plus `data` (rows passing the current rule)
- `buildRoot(condition, lens, fields, maxDepth, commit)` — the pure tree builder behind the hook
- `resolve(source, { sourceValues })` — compose a `RuleBuilderSource` (+ fetched values) into the exposed surface
- `describeModelFields(lens, map, model, { labels, valueLabels, targets })` — the selectable fields + operator sets
- `runSources(lensOrNarrowing, rows)` — DISTINCT option sets for sourced fields
- `lensValuePicker` / `useLensValuePicker` — the field/path picker atom
- `parseSavedRule` / `stringifySavedRule` — validated rule serialization

See [PLAN.md](./PLAN.md) for the architecture.

## Related

- [@inixiative/json-rules](https://github.com/inixiative/json-rules) - Core rule engine
- [@inixiative/conditional-form](https://github.com/inixiative/conditional-form) - Render forms using rules
