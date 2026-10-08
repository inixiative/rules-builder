import {
  ALL_KINDS,
  type ArrayOperator,
  type Bridge,
  createLens,
  type DateOperator,
  type FieldKind,
  type FieldMap,
  type FieldMapEntry,
  getArrayOperators,
  getLensRoot,
  getOperatorsForKind,
  getValueShape,
  type Lens,
  type LensNarrowing,
  lensVisit,
  type ModelNarrowing,
  type NarrowingDefaults,
  NUMERIC_KINDS,
  type Operator,
  type OperatorFamily,
  type PathProjection,
  type ProjectLensOptions,
  projectLens,
  type RuleTarget,
  type SourceOption,
  type SourceValues,
  type ValueShape,
} from '@inixiative/json-rules';

export type RuleBuilderSource = {
  maps: Record<string, FieldMap>;
  bridges?: Bridge[];
  mapName: string;
  model: string;
  // Parent-less: the builder attaches the composed lens as the parent, so callers
  // pass only serializable narrowing data (no in-memory object graph). A list is a
  // chain, outermost first, each layer narrowing the one before. `sources` on the
  // narrowing's models declare table-backed option sets; their fetched values arrive
  // separately via `resolve(..., { sourceValues })`. The first layer is the first
  // narrowing over the base lens, so it is what turns relations on (`root.relations`,
  // `mapDefaults…models.M.relations`) — without it a rule reads the anchor's columns only.
  narrowing?: NarrowingLayer | readonly NarrowingLayer[];
};

/** One parent-less layer of a {@link RuleBuilderSource}'s narrowing. */
export type NarrowingLayer = Omit<LensNarrowing, 'parent'>;

const layersOf = (narrowing: RuleBuilderSource['narrowing']): readonly NarrowingLayer[] =>
  narrowing === undefined
    ? []
    : Array.isArray(narrowing)
      ? narrowing
      : [narrowing as NarrowingLayer];

export type ResolveOptions = { sourceValues?: readonly SourceValues[] };

/** Compose a serializable source into its narrowed lens — the gate. */
export const composeNarrowed = (source: RuleBuilderSource): Lens | LensNarrowing => {
  const lens = createLens({
    maps: source.maps,
    bridges: source.bridges,
    mapName: source.mapName,
    model: source.model,
  });
  return layersOf(source.narrowing).reduce<Lens | LensNarrowing>(
    (parent, layer) => ({ parent, ...layer }),
    lens,
  );
};

/** A {@link RuleBuilderSource} read off a lens by {@link builderSource}: one parent-less
 *  layer, its `root` spelling each path the lens shows. */
export type LensBuilderSource = Omit<RuleBuilderSource, 'narrowing' | 'bridges'> & {
  narrowing: { root: ModelNarrowing };
};

// What the projection shows at `path`, spelled as a narrowing node: its columns as picks, an
// enum's values as enumPicks, and each relation shown there as a child node. Bridges are left off.
const shownNode = (projection: PathProjection, path: string): ModelNarrowing => {
  const picks: string[] = [];
  const enumPicks: Record<string, readonly string[]> = {};
  const relations: Record<string, ModelNarrowing> = {};
  for (const [name, entry] of Object.entries(projection[path]?.fields ?? {})) {
    if (entry.kind === 'object') {
      const child = `${path}.${name}`;
      if (projection[child]) relations[name] = shownNode(projection, child);
      continue;
    }
    if (entry.kind === 'bridge') continue;
    picks.push(name);
    if (entry.kind === 'enum' && entry.values) enumPicks[name] = entry.values;
  }
  return {
    picks,
    ...(Object.keys(enumPicks).length ? { enumPicks } : {}),
    ...(Object.keys(relations).length ? { relations } : {}),
  };
};

/**
 * The serializable source a builder authors against, read off a lens path by path: the lens's
 * model-keyed surface (`projectLens(…, { by: 'model' })`, `sourceValues` folded onto it) and one
 * layer whose `root` spells, at each path the lens shows, exactly the columns, enum values and
 * relations it shows there. Composed ({@link composeNarrowed}), it gates each path as the lens
 * does: a column one path shows is not offered at another visit of the same model. It ships no
 * clamp — no `where` reaches the client — and no bridge.
 */
export const builderSource = (
  lens: Lens | LensNarrowing,
  options: ProjectLensOptions = {},
): LensBuilderSource => {
  const { maps, mapName, model } = projectLens(lens, { ...options, by: 'model' });
  return {
    maps,
    mapName,
    model,
    narrowing: { root: shownNode(projectLens(lens, options), getLensRoot(lens).model) },
  };
};

// `node` with every relation `spelled` names turned on beneath it, hop by hop, and nothing else
// of `spelled` (its picks, omits and clamps stay in its own layer).
const turnOn = (node: ModelNarrowing, spelled: ModelNarrowing['relations']): ModelNarrowing => {
  if (!spelled || Object.keys(spelled).length === 0) return node;
  const relations: Record<string, ModelNarrowing> = { ...node.relations };
  for (const [name, child] of Object.entries(spelled))
    relations[name] = turnOn(relations[name] ?? {}, child.relations);
  return { ...node, relations };
};

/**
 * The source with every relation turned on in its first layer, merged over what that layer
 * already says: every model's relations at the model defaults — json-rules grows them as a
 * tree from the anchor and each spelled path, each model at its nearest reach — and the
 * anchor's own relations spelled at the root, so the record's every relation is on there (a
 * self-relation included, which the tree would not reach again). Every path a later layer
 * spells under `root.relations` is spelled under the first layer's too, so a later layer can
 * restate a hop past the tree's reach. The posture of a raw record, and of a first-layer grant;
 * later layers still narrow it.
 */
export const withAllRelations = (source: RuleBuilderSource): RuleBuilderSource => {
  const base = createLens({
    maps: source.maps,
    bridges: source.bridges,
    mapName: source.mapName,
    model: source.model,
  });
  const [first = {}, ...rest] = layersOf(source.narrowing);
  const anchor: Record<string, ModelNarrowing> = {};
  for (const [name, entry] of Object.entries(
    base.maps[source.mapName]?.models[source.model]?.fields ?? {},
  ))
    if (relationTarget(entry, source.mapName)) anchor[name] = {};
  const mapDefaults: Record<string, NarrowingDefaults> = { ...first.mapDefaults };
  for (const [mapName, map] of Object.entries(base.maps))
    for (const [modelName, model] of Object.entries(map.models)) {
      const relations: Record<string, ModelNarrowing> = {};
      for (const [name, entry] of Object.entries(model.fields))
        if (relationTarget(entry, mapName)) relations[name] = {};
      if (Object.keys(relations).length === 0) continue;
      const defaults = mapDefaults[mapName] ?? {};
      const own = defaults.models?.[modelName] ?? {};
      mapDefaults[mapName] = {
        ...defaults,
        models: {
          ...defaults.models,
          [modelName]: { ...own, relations: { ...relations, ...own.relations } },
        },
      };
    }
  const root = rest.reduce((node, later) => turnOn(node, later.root?.relations), {
    ...first.root,
    relations: { ...anchor, ...first.root?.relations },
  } as ModelNarrowing);
  const layer = { ...first, root, mapDefaults };
  return { ...source, narrowing: rest.length ? [layer, ...rest] : layer };
};

/** One visit a view shows: the model it sits on and its fields as the lens exposes them
 *  there — a relation only where it is turned on. */
export type ViewVisit = { mapName: string; model: string; fields: Record<string, FieldMapEntry> };

/**
 * A narrowed lens as the builder reads it. `lens` is the gate: every rule is validated,
 * coerced and described against it, never against a projected surface (a surface is a bare
 * lens, which turns no relation on). `visit(at)` is the visit at a dotted path from the
 * anchor model (`User`, `User.orders`), `undefined` where the lens shows none — so a field
 * list read off a visit is exactly what the lens shows on that path.
 */
export type LensView = {
  lens: Lens | LensNarrowing;
  mapName: string;
  model: string;
  visit: (at: string) => ViewVisit | undefined;
};

/** A scope of a view: the visit at `at`, a key of `view.visit`. */
export type ViewAt = { view: LensView; at: string };

/** A view over a lens or narrowing: each visit resolved on demand by json-rules' `lensVisit`
 *  (the gate's own rules, nothing enumerated) and kept. `sourceValues` attach each sourced
 *  field's fetched options at its path. */
export const createView = (lens: Lens | LensNarrowing, opts: ResolveOptions = {}): LensView => {
  const { mapName, model } = getLensRoot(lens);
  const visits = new Map<string, ViewVisit | undefined>();
  const visit = (at: string): ViewVisit | undefined => {
    if (visits.has(at)) return visits.get(at);
    const dot = at.indexOf('.');
    const head = dot < 0 ? at : at.slice(0, dot);
    const shown =
      head === model
        ? lensVisit(lens, dot < 0 ? '' : at.slice(dot + 1), { sourceValues: opts.sourceValues })
        : null;
    const out = shown
      ? { mapName: shown.mapName, model: shown.model, fields: shown.fields }
      : undefined;
    visits.set(at, out);
    return out;
  };
  return { lens, mapName, model, visit };
};

/**
 * Resolve a serializable source (+ optional fetched `sourceValues`) to the view the builder
 * reads: the narrowed lens (the gate) and its path projection, each sourced field's fetched
 * options attached at its own path. The gate knows no fetched set — a node's value is held
 * to the fetched options of the visit it sits on by the builder (`value.valid`, folded into
 * `valid`), since json-rules takes no per-path `sourceValues` on the gate.
 */
export const resolve = (source: RuleBuilderSource, opts: ResolveOptions = {}): LensView =>
  createView(composeNarrowed(source), opts);

/**
 * The view of a raw record: every column, and every relation turned on at the model defaults
 * ({@link withAllRelations}) — the tree json-rules grows from them, each model at its nearest
 * reach. What a permission or transition gates is the record itself, not a narrowed lens.
 */
export const rawView = (source: Omit<RuleBuilderSource, 'narrowing'>): LensView =>
  createView(
    composeNarrowed(
      withAllRelations({
        maps: source.maps,
        bridges: source.bridges,
        mapName: source.mapName,
        model: source.model,
      }),
    ),
  );

/** The schema `validateRule` compiles a target against: the narrowed lens's root, as
 *  json-rules' `describeRule` passes it. */
export const schemaOf = (
  lens: Lens | LensNarrowing,
): { map: Lens; mapName: string; model: string } => {
  const root = getLensRoot(lens);
  return { map: root, mapName: root.mapName, model: root.model };
};

/** The anchor's scope. */
export const viewRoot = (view: LensView): ViewAt => ({ view, at: view.model });

/** The scope `path` (dotted relation names) below `scope`. */
export const viewAt = (scope: ViewAt, path: string): ViewAt =>
  path ? { view: scope.view, at: `${scope.at}.${path}` } : scope;

/** The visit a scope sits on, `undefined` where the lens shows none. */
export const visitOf = (scope: ViewAt): ViewVisit | undefined => scope.view.visit(scope.at);

export type BuilderField = {
  name: string;
  label: string;
  /** Optional display glyph, carried from a {@link Decoration} hoisted entry. */
  icon?: string;
  kind: FieldKind;
  isList: boolean;
  relation?: { mapName: string; modelName: string };
  isBridge: boolean;
  operators: { field: Operator[]; date: DateOperator[]; array: ArrayOperator[] };
  /** A hoisted collection entry seeds this whole `Condition` on select (an array
   *  node with a pre-filled `where`/operator) instead of the default `{field}` rule.
   *  Set by {@link Decoration}; absent for ordinary and leaf-hoisted fields. */
  seed?: import('@inixiative/json-rules').Condition;
  /** False for a hoist *resolver* field — present only so a seeded array node's
   *  dotted `field` resolves its relation, never offered in the picker. */
  selectable?: boolean;
  /** The surface's option set verbatim — a grouped source's options carry their
   *  partition keys in `groups` (index-aligned with `groupBy`). `enumValues`/
   *  `enumLabels` stay the flattened view for renderers that don't partition. */
  options?: readonly SourceOption[];
  /** The source's partition axes (dotted paths on this model, json-rules 2.18) —
   *  a sibling clause on an axis pins this field's options to that partition. */
  groupBy?: readonly string[];
  /** Present for enums and pseudo-enums (value-bearing fields) → render a select. */
  enumValues?: readonly string[];
  /** Human-readable labels for enum/sourced option values (value → label). */
  enumLabels?: Record<string, string>;
  /** A `Json` column: no declared sub-fields, but the kernel resolves a dotted JSON
   *  path on the operand — a renderer may let the user append a freeform sub-path. */
  acceptsSubPath?: boolean;
  /** True when this scalar can be the numeric target of a `sum`/`avg` aggregate over
   *  a list relation — a numeric scalar (Int/Float/Decimal/BigInt) or a `Json` column.
   *  Consumed by the {@link ArrayNode} aggregate facet's field picker. */
  aggregatable?: boolean;
  /** For an `aggregatable` field: whether `toPrisma()` can compile a `groupBy` over it.
   *  `true` for numeric scalars; `false` for `Json` — the in-memory `check()` runs a
   *  Json aggregate fine, but Prisma `groupBy` cannot `_sum`/`_avg` a JSON-extracted
   *  value, so a renderer should warn rather than emit a rule that 500s on DB eval. */
  compilesToPrisma?: boolean;
};

export type SurfaceOptions = {
  targets?: RuleTarget[];
  /** Field labels, keyed by `name` or `Model.name`. */
  labels?: Record<string, string>;
  /** Enum/sourced value labels, keyed by `name` or `Model.name` → (value → label). */
  valueLabels?: Record<string, Record<string, string>>;
};

const RELATION_KINDS = new Set(['object', 'bridge']);
const KNOWN_KINDS = new Set<string>(ALL_KINDS);

// Unknown (non-Prisma) types fall back to String so the field still gets operators.
export const toFieldKind = (type: string): FieldKind =>
  KNOWN_KINDS.has(type) ? (type as FieldKind) : 'String';

export const relationTarget = (
  entry: FieldMapEntry,
  currentMap: string,
): { mapName: string; modelName: string } | undefined => {
  if (entry.kind === 'object') return { mapName: currentMap, modelName: entry.type };
  if (entry.kind === 'bridge') {
    const [m, n] = entry.type.includes(':') ? entry.type.split(':') : [currentMap, entry.type];
    return { mapName: m, modelName: n };
  }
  return undefined;
};

const supportedByAllTargets = (
  op: Operator | DateOperator | ArrayOperator,
  targets: RuleTarget[] | undefined,
  perTarget: (t: RuleTarget) => readonly (Operator | DateOperator | ArrayOperator)[],
): boolean => {
  if (!targets || targets.length === 0) return true;
  return targets.every((t) => perTarget(t).includes(op));
};

const fieldAndDateOperators = (
  kind: FieldKind,
  targets: RuleTarget[] | undefined,
): { field: Operator[]; date: DateOperator[] } => {
  const base = getOperatorsForKind(kind);
  const field = base.field.filter((op) =>
    supportedByAllTargets(op, targets, (t) => getOperatorsForKind(kind, t).field),
  );
  const date = base.date.filter((op) =>
    supportedByAllTargets(op, targets, (t) => getOperatorsForKind(kind, t).date),
  );
  return { field, date };
};

const arrayOperators = (targets: RuleTarget[] | undefined): ArrayOperator[] =>
  getArrayOperators().filter((op) =>
    supportedByAllTargets(op, targets, (t) => getArrayOperators(t)),
  );

// Prefer labels from the surface's `options` (json-rules folds a sourced field's
// value→label there); a caller-supplied `valueLabels` entry overrides (e.g. human
// labels for enum values, which json-rules surfaces as label === value).
const mergeOptionLabels = (
  options: readonly { value: string; label?: string }[] | undefined,
  overrides: Record<string, string> | undefined,
): Record<string, string> | undefined => {
  const fromOptions = options?.reduce<Record<string, string>>((acc, o) => {
    if (o.label !== undefined && o.label !== o.value) acc[o.value] = o.label;
    return acc;
  }, {});
  const merged = { ...fromOptions, ...overrides };
  return Object.keys(merged).length ? merged : undefined;
};

/** The operator sets a non-relation field of `kind` offers, intersected across
 *  `targets`. Exposed so a hoist can recompute them when it overrides a leaf's
 *  kind (e.g. an untyped EAV `value` column declared as `Int`). */
export const operatorsForKind = (
  kind: FieldKind,
  targets?: RuleTarget[],
): BuilderField['operators'] => ({
  ...fieldAndDateOperators(kind, targets),
  array: [] as ArrayOperator[],
});

/** The operator set for a value whose kind is undeclared — every operator the catalog
 *  offers to any kind, intersected across `targets`. Offered below a `Json` column's
 *  boundary: json-rules resolves nothing under the column, so no kind-specific
 *  narrowing applies there and the kernel compares the traversed value untyped (a
 *  mismatch is an ordinary non-match, not an authoring error). */
export const genericOperators = (targets?: RuleTarget[]): BuilderField['operators'] => {
  const field = new Set<Operator>();
  const date = new Set<DateOperator>();
  for (const kind of ALL_KINDS) {
    const ops = fieldAndDateOperators(kind, targets);
    for (const op of ops.field) field.add(op);
    for (const op of ops.date) date.add(op);
  }
  return { field: [...field], date: [...date], array: [] as ArrayOperator[] };
};

const describeFieldEntries = (
  entries: Record<string, FieldMapEntry>,
  mapName: string,
  modelName: string,
  opts: SurfaceOptions,
): BuilderField[] => {
  const out: BuilderField[] = [];
  for (const [name, entry] of Object.entries(entries)) {
    const isRelation = RELATION_KINDS.has(entry.kind);
    const isList = entry.isList === true;
    const kind: FieldKind = entry.kind === 'enum' ? 'Enum' : toFieldKind(entry.type);

    // Numeric-aggregate targets: a numeric scalar compiles to a Prisma groupBy; a
    // Json column is check()-only (flagged so a renderer can warn, not hard-block).
    const isNumericScalar = entry.kind === 'scalar' && NUMERIC_KINDS.includes(kind);
    const isJsonScalar = entry.kind === 'scalar' && kind === 'Json';
    const aggregatable = isNumericScalar || isJsonScalar;

    const operators = isRelation
      ? {
          field: [] as Operator[],
          date: [] as DateOperator[],
          array: isList ? arrayOperators(opts.targets) : [],
        }
      : { ...fieldAndDateOperators(kind, opts.targets), array: [] as ArrayOperator[] };

    out.push({
      name,
      label: opts.labels?.[`${modelName}.${name}`] ?? opts.labels?.[name] ?? name,
      kind,
      isList,
      isBridge: entry.kind === 'bridge',
      relation: isRelation ? relationTarget(entry, mapName) : undefined,
      operators,
      options: entry.options,
      groupBy: entry.groupBy,
      enumValues: entry.options?.map((o) => o.value) ?? entry.values,
      enumLabels: mergeOptionLabels(
        entry.options,
        opts.valueLabels?.[`${modelName}.${name}`] ?? opts.valueLabels?.[name],
      ),
      acceptsSubPath: kind === 'Json',
      aggregatable: aggregatable || undefined,
      compilesToPrisma: aggregatable ? isNumericScalar : undefined,
    });
  }
  return out;
};

/** The selectable fields of a model in a model-keyed Lens (a `projectLens(…, { by: 'model' })`
 *  surface, or raw maps): every field it carries, unioned over its visits. Prefer
 *  {@link describeScopeFields}, which reads one visit exactly. */
export const describeModelFields = (
  lens: Lens,
  mapName: string,
  modelName: string,
  opts: SurfaceOptions = {},
): BuilderField[] => {
  const model = lens.maps[mapName]?.models[modelName];
  return model ? describeFieldEntries(model.fields, mapName, modelName, opts) : [];
};

/** The selectable fields at one scope of a view — exactly what the lens shows on that path. */
export const describeScopeFields = (scope: ViewAt, opts: SurfaceOptions = {}): BuilderField[] => {
  const visit = visitOf(scope);
  return visit ? describeFieldEntries(visit.fields, visit.mapName, visit.model, opts) : [];
};

export const valueShapeForOperator = (
  operator: Operator | DateOperator | ArrayOperator,
  family: OperatorFamily,
): ValueShape => getValueShape(operator, family);

/** {@link valueShapeForOperator} for an operator that may not be in the catalog — a
 *  persisted rule from an older engine, or a decoration typo. `undefined` instead of
 *  the throw, so a setter or a shape read can treat it as "shape unknown" and still
 *  build the node. */
export const knownValueShape = (
  operator: string,
  family: OperatorFamily,
): ValueShape | undefined => {
  try {
    return getValueShape(operator, family);
  } catch {
    return undefined;
  }
};

/** Shapes a single operand can move between untouched: a scalar, an ordered scalar,
 *  a substring and a pattern are all one bare value, so `equals -> greaterThan` or
 *  `equals -> contains` keeps what the user typed. A date value, a date window, a
 *  range, a list and a day list each hold a different thing. */
const INTERCHANGEABLE_SHAPES: ReadonlySet<ValueShape> = new Set([
  'scalar',
  'ordered',
  'string',
  'pattern',
]);

/** The class of operand an operator carries — two operators of the same class accept
 *  each other's value. `undefined` for an operator the catalog does not know (a
 *  persisted legacy rule), which a caller should read as "leave the operand alone". */
export const operandClass = (operator: string, family: OperatorFamily): string | undefined => {
  const shape = knownValueShape(operator, family);
  if (shape === undefined) return undefined;
  return INTERCHANGEABLE_SHAPES.has(shape) ? 'scalar' : shape;
};
