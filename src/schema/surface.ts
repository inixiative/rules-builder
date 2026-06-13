import {
  type ArrayOperator,
  type DateOperator,
  type FieldKind,
  type FieldMapEntry,
  getArrayOperators,
  getOperatorsForKind,
  getValueShape,
  type Lens,
  type Operator,
  type RuleTarget,
  type ValueShape,
} from '@inixiative/json-rules';

/**
 * A field as the builder sees it: its kind, the operators valid for it (already
 * intersected across the configured execution targets), and — for relations —
 * where descending into it leads. Derived from an `exposedSurface` Lens, so it
 * only ever describes fields the narrowing exposes.
 */
export type BuilderField = {
  /** Field key on the model (e.g. `email`, or a bridge key like `crm:Contact`). */
  name: string;
  /** Display label — decoration; defaults to `name`. */
  label: string;
  kind: FieldKind;
  isList: boolean;
  /** For relation/bridge fields: the model descending into this field reaches. */
  relation?: { mapName: string; modelName: string };
  isBridge: boolean;
  /** Operators valid for this field, by family, for the configured targets. */
  operators: { field: Operator[]; date: DateOperator[]; array: ArrayOperator[] };
  /** Allowed enum values (already narrowed) for enum fields. */
  enumValues?: readonly string[];
};

export type SurfaceOptions = {
  /**
   * Execution targets the rule must support. An operator is offered only if every
   * listed target supports it. Omit to offer every operator (check superset).
   */
  targets?: RuleTarget[];
  /** Optional display labels, keyed by `"Model.field"` or `field`. */
  labels?: Record<string, string>;
};

const RELATION_KINDS = new Set(['object', 'bridge']);

const relationTarget = (
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
  // No-target call is the superset; intersect down per configured target.
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

/**
 * Describes the fields of one model in an exposed-surface lens as `BuilderField`s.
 * Relation/bridge list fields carry array operators (and a `relation` target to
 * descend into); scalar/enum/date fields carry field/date operators valid for the
 * configured targets.
 */
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
    const kind: FieldKind = entry.kind === 'enum' ? 'Enum' : (entry.type as FieldKind);

    const operators = isRelation
      ? { field: [] as Operator[], date: [] as DateOperator[], array: isList ? arrayOperators(opts.targets) : [] }
      : { ...fieldAndDateOperators(kind, opts.targets), array: [] as ArrayOperator[] };

    out.push({
      name,
      label: opts.labels?.[`${modelName}.${name}`] ?? opts.labels?.[name] ?? name,
      kind,
      isList,
      isBridge: entry.kind === 'bridge',
      relation: isRelation ? relationTarget(entry, mapName) : undefined,
      operators,
      enumValues: entry.kind === 'enum' ? entry.values : undefined,
    });
  }
  return out;
};

/** The value-input shape an operator expects — drives which slot the UI renders. */
export const valueShapeForOperator = (
  operator: Operator | DateOperator | ArrayOperator,
): ValueShape => getValueShape(operator);
