import {
  ALL_KINDS,
  type ArrayOperator,
  type Bridge,
  createLens,
  type DateOperator,
  exposedSurface,
  type FieldKind,
  type FieldMap,
  type FieldMapEntry,
  getArrayOperators,
  getOperatorsForKind,
  getValueShape,
  type Lens,
  type LensNarrowing,
  type Operator,
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
  // pass only serializable narrowing data (no in-memory object graph). `sources` on
  // the narrowing's models declare table-backed option sets; their fetched values
  // arrive separately via `resolve(..., { sourceValues })`.
  narrowing?: Omit<LensNarrowing, 'parent'>;
};

export type ResolveOptions = { sourceValues?: readonly SourceValues[] };

/** Compose a serializable source into its narrowed lens (pre-projection). */
export const composeNarrowed = (source: RuleBuilderSource): Lens | LensNarrowing => {
  const lens = createLens({
    maps: source.maps,
    bridges: source.bridges,
    mapName: source.mapName,
    model: source.model,
  });
  return source.narrowing ? { parent: lens, ...source.narrowing } : lens;
};

/**
 * Resolve a serializable source (+ optional fetched `sourceValues`) to the public
 * surface the builder reads. Folds createLens + narrowing + value-decoration +
 * projection in one call — fetched options land on `field.options` inside the
 * projection, never by mutating the maps.
 */
export const resolve = (source: RuleBuilderSource, opts: ResolveOptions = {}): Lens =>
  exposedSurface(composeNarrowed(source), { sourceValues: opts.sourceValues });

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
   *  partition in `group` (json-rules 2.17). `enumValues`/`enumLabels` stay the
   *  flattened view for renderers that don't partition. */
  options?: readonly SourceOption[];
  /** Present for enums and pseudo-enums (value-bearing fields) → render a select. */
  enumValues?: readonly string[];
  /** Human-readable labels for enum/sourced option values (value → label). */
  enumLabels?: Record<string, string>;
  /** A `Json` column: no declared sub-fields, but the kernel resolves a dotted JSON
   *  path on the operand — a renderer may let the user append a freeform sub-path. */
  acceptsSubPath?: boolean;
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

export const describeModelFields = (
  lens: Lens,
  mapName: string,
  modelName: string,
  opts: SurfaceOptions = {},
): BuilderField[] => {
  const model = lens.maps[mapName]?.models[modelName];
  if (!model) return [];

  const out: BuilderField[] = [];
  for (const [name, entry] of Object.entries(model.fields)) {
    const isRelation = RELATION_KINDS.has(entry.kind);
    const isList = entry.isList === true;
    const kind: FieldKind = entry.kind === 'enum' ? 'Enum' : toFieldKind(entry.type);

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
      enumValues: entry.options?.map((o) => o.value) ?? entry.values,
      enumLabels: mergeOptionLabels(
        entry.options,
        opts.valueLabels?.[`${modelName}.${name}`] ?? opts.valueLabels?.[name],
      ),
      acceptsSubPath: kind === 'Json',
    });
  }
  return out;
};

export const valueShapeForOperator = (
  operator: Operator | DateOperator | ArrayOperator,
): ValueShape => getValueShape(operator);
