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

/**
 * Resolve a serializable source (+ optional fetched `sourceValues`) to the public
 * surface the builder reads. Folds createLens + narrowing + value-decoration +
 * projection in one call — fetched values land on `field.values` inside the
 * projection, never by mutating the maps.
 */
export const resolve = (source: RuleBuilderSource, opts: ResolveOptions = {}): Lens => {
  const lens = createLens({
    maps: source.maps,
    bridges: source.bridges,
    mapName: source.mapName,
    model: source.model,
  });
  const narrowed = source.narrowing ? { parent: lens, ...source.narrowing } : lens;
  return exposedSurface(narrowed, { sourceValues: opts.sourceValues });
};

export type BuilderField = {
  name: string;
  label: string;
  kind: FieldKind;
  isList: boolean;
  relation?: { mapName: string; modelName: string };
  isBridge: boolean;
  operators: { field: Operator[]; date: DateOperator[]; array: ArrayOperator[] };
  /** Present for enums and pseudo-enums (value-bearing fields) → render a select. */
  enumValues?: readonly string[];
};

export type SurfaceOptions = {
  targets?: RuleTarget[];
  labels?: Record<string, string>;
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
  getArrayOperators().filter((op) => supportedByAllTargets(op, targets, (t) => getArrayOperators(t)));

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
      enumValues: entry.values,
    });
  }
  return out;
};

export const valueShapeForOperator = (
  operator: Operator | DateOperator | ArrayOperator,
): ValueShape => getValueShape(operator);
