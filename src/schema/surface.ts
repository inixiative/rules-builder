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
  type ModelNarrowing,
  type NarrowingDefaults,
  NUMERIC_KINDS,
  type Operator,
  type OperatorFamily,
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

/**
 * The source with every relation of every model turned on at the model defaults of its first
 * layer (each edge crossed once per path), merged over what that layer already says. The
 * posture of a raw record, and of a first-layer grant, which may read any relation on the
 * schema; later layers still narrow it.
 */
export const withAllRelations = (source: RuleBuilderSource): RuleBuilderSource => {
  const base = createLens({
    maps: source.maps,
    bridges: source.bridges,
    mapName: source.mapName,
    model: source.model,
  });
  const [first = {}, ...rest] = layersOf(source.narrowing);
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
  const layer = { ...first, mapDefaults };
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

/** A view over a lens or narrowing, read through its path projection (`projectLens`).
 *  `sourceValues` attach each sourced field's fetched options at its path. A field whose
 *  map entry declares `options` keeps them (labels and partition `groups`), cut to the
 *  values the lens allows there — the path projection rebuilds unfetched options from the
 *  allowed values alone, which drops both. */
export const createView = (lens: Lens | LensNarrowing, opts: ResolveOptions = {}): LensView => {
  const paths = projectLens(lens, { sourceValues: opts.sourceValues });
  const base = getLensRoot(lens);
  const fetched = new Set((opts.sourceValues ?? []).map((sv) => `${sv.path}|${sv.field}`));
  const visits = new Map<string, ViewVisit>();
  const visit = (at: string): ViewVisit | undefined => {
    if (!Object.hasOwn(paths, at)) return undefined;
    const cached = visits.get(at);
    if (cached) return cached;
    const projected = paths[at];
    const declared = base.maps[projected.mapName]?.models[projected.model]?.fields ?? {};
    const fields: Record<string, FieldMapEntry> = {};
    for (const [name, entry] of Object.entries(projected.fields)) {
      const own = Object.hasOwn(declared, name) ? declared[name].options : undefined;
      if (!own || fetched.has(`${at}|${name}`)) {
        fields[name] = entry;
        continue;
      }
      const allowed = entry.values && new Set(entry.values);
      fields[name] = { ...entry, options: allowed ? own.filter((o) => allowed.has(o.value)) : own };
    }
    const out = { mapName: projected.mapName, model: projected.model, fields };
    visits.set(at, out);
    return out;
  };
  return { lens, mapName: base.mapName, model: base.model, visit };
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
 * The view of a raw record: every column, and every relation turned on wherever its model is
 * visited, each edge (`Model.relation`) crossed once per path — the cap json-rules applies to a
 * model-default relation. What a permission or transition gates is the record itself, not a
 * narrowed lens. Its visits are walked on demand, so a wide schema is never projected whole.
 */
export const rawView = (source: Omit<RuleBuilderSource, 'narrowing'>): LensView => {
  const raw = {
    maps: source.maps,
    bridges: source.bridges,
    mapName: source.mapName,
    model: source.model,
  };
  const base = createLens(raw);
  const lens = composeNarrowed(withAllRelations(raw));

  const modelAt = (mapName: string, modelName: string) => {
    const map = Object.hasOwn(base.maps, mapName) ? base.maps[mapName] : undefined;
    return map && Object.hasOwn(map.models, modelName)
      ? { map, model: map.models[modelName] }
      : undefined;
  };
  const visit = (at: string): ViewVisit | undefined => {
    const [anchor, ...hops] = at.split('.');
    if (anchor !== source.model) return undefined;
    let mapName = source.mapName;
    let modelName = source.model;
    const crossed = new Set<string>();
    for (const hop of hops) {
      const entry = modelAt(mapName, modelName)?.model.fields[hop];
      const target = entry && relationTarget(entry, mapName);
      const edge = `${mapName}:${modelName}.${hop}`;
      if (!target || crossed.has(edge)) return undefined;
      crossed.add(edge);
      mapName = target.mapName;
      modelName = target.modelName;
    }
    const found = modelAt(mapName, modelName);
    if (!found) return undefined;
    const fields: Record<string, FieldMapEntry> = {};
    for (const [name, entry] of Object.entries(found.model.fields)) {
      if (relationTarget(entry, mapName)) {
        if (!crossed.has(`${mapName}:${modelName}.${name}`)) fields[name] = entry;
        continue;
      }
      const values =
        entry.kind === 'enum' ? (entry.values ?? found.map.enums?.[entry.type]) : entry.values;
      fields[name] = values ? { ...entry, values } : entry;
    }
    return { mapName, model: modelName, fields };
  };
  return { lens, mapName: source.mapName, model: source.model, visit };
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
