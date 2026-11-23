import {
  aggregateModesForKind,
  type Condition,
  describeValue,
  type FieldKind,
  inferValueType,
  listItems,
  NUMERIC_KINDS,
  VALUE_AGGREGATE_MODES,
  type ValidationIssue,
  type ValueAggregateMode,
  type ValueExpression,
  type ValueExpressionShape,
  type ValueType,
} from '@inixiative/json-rules';
import {
  type ArrayNode,
  type BuilderNode,
  buildRoot,
  type PickOption,
} from '../builder/buildNodes';
import { lensScopeSurface } from '../schema/lensScopeSurface';
import {
  type BuilderField,
  describeScopeFields,
  type LensView,
  type SurfaceOptions,
  viewAt,
  viewRoot,
} from '../schema/surface';
import { issuePathOf, setValueAt, shapeOf, type ValuePath } from './valueTree';

type Rec = Record<string, unknown>;

/** The shapes a value editor may offer, json-rules' own: a literal, a source (`{ path }`, or
 *  `{ bind }` where bindings are on), an aggregate, if / then / else, a list. */
export const VALUE_SHAPES: readonly ValueExpressionShape[] = [
  'literal',
  'source',
  'aggregate',
  'if',
  'list',
];

export type ValueBuilderOptions = {
  /** The view the value reads: its paths, relations and the conditions an `if` authors. */
  view: LensView;
  /** The anchor's fields, for the conditions an `if` or an aggregate authors. */
  fields: BuilderField[];
  maxDepth?: number;
  commit: (next: ValueExpression) => void;
  /** Offer `{ bind }` sources (Zealot refuses binds: `false`). Default true. */
  bindings?: boolean;
  /** The shapes offered (default {@link VALUE_SHAPES}). */
  shapes?: readonly ValueExpressionShape[];
  /** The kind the caller's target holds (a map column's). A string literal is stamped
   *  `{ value, coerceType }` when this is DateTime or numeric (json-rules FEAT-008), so it reads
   *  as that kind; json-rules never guesses it. */
  expectedKind?: FieldKind;
  /** Whether the target accepts a value of this type (the caller's column check). */
  acceptsType?: (type: ValueType) => boolean;
  surfaceOpts?: SurfaceOptions;
};

/** The shape control every value node carries. */
export type ValueShapeControl = {
  value: ValueExpressionShape;
  options: PickOption[];
  set: (shape: ValueExpressionShape) => void;
};

type ValueNodeBase = {
  id: string;
  path: ValuePath;
  depth: number;
  shape: ValueShapeControl;
  /** The type json-rules infers here; null when it can't (an unknown path, a binding). */
  type: ValueType | null;
  /** json-rules' issues at this node (shape, lens gate, type), not its children's. */
  issues: ValidationIssue[];
  /** The caller's `acceptsType`, at the root only. */
  accepted?: boolean;
  remove?: () => void;
};

export type LiteralValueNode = ValueNodeBase & {
  kind: 'literal';
  value: unknown;
  set: (value: unknown) => void;
  /** The kind the literal is read as (`coerceType`), when the caller's target stamps one. */
  coerceType?: FieldKind;
};

export type SourceValueNode = ValueNodeBase & {
  kind: 'source';
  mode: { value: 'path' | 'bind'; options: PickOption[]; set: (mode: 'path' | 'bind') => void };
  /** The path read, from the row's values the lens shows: through to-one relations, never past
   *  a list. */
  sourcePath?: { value?: string; options: PickOption[]; set: (path: string) => void };
  /** The binding read (only where bindings are on). */
  bindName?: { value?: string; set: (name: string) => void };
};

export type AggregateValueNode = ValueNodeBase & {
  kind: 'aggregate';
  /** The list (relation or scalar list column), its element condition, window filter and
   *  ordering: the condition builder's aggregate node, without its comparison. */
  list: ArrayNode;
  mode: {
    value: ValueAggregateMode;
    options: PickOption[];
    set: (mode: ValueAggregateMode) => void;
  };
  /** The element's column the mode reads (absent for `count` of rows and for a scalar list). */
  field?: { value?: string; options: PickOption[]; set: (field: string | undefined) => void };
};

export type IfValueNode = ValueNodeBase & {
  kind: 'if';
  if: BuilderNode;
  then: ValueNode;
  else?: ValueNode;
  addElse?: () => void;
  removeElse?: () => void;
};

export type ListValueNode = ValueNodeBase & {
  kind: 'list';
  items: ValueNode[];
  addItem: () => void;
  distinct: { value: boolean; set: (distinct: boolean) => void };
};

export type ValueNode =
  | LiteralValueNode
  | SourceValueNode
  | AggregateValueNode
  | IfValueNode
  | ListValueNode;

type Ctx = Required<Omit<ValueBuilderOptions, 'expectedKind' | 'acceptsType'>> & {
  root: ValueExpression;
  expectedKind?: FieldKind;
  acceptsType?: (type: ValueType) => boolean;
  /** json-rules' issues at a value position (`$`, `$.then`, `$[1]`). */
  issues: ValidationIssue[];
  /** Its lens-gate issues, which name the row path read (`owner.nope`), claimed by the node that
   *  reads that path. */
  gateIssues: ValidationIssue[];
  claimed: Set<ValidationIssue>;
};

const opt = (value: string, label = value): PickOption => ({ value, label });

const COERCED_KINDS: readonly FieldKind[] = ['DateTime', ...NUMERIC_KINDS];

const defaultForShape = (shape: ValueExpressionShape): ValueExpression => {
  switch (shape) {
    case 'literal':
      return '';
    case 'source':
      return { path: '' } as ValueExpression;
    case 'aggregate':
      return { field: '', aggregate: { mode: 'count' } } as ValueExpression;
    case 'if':
      return { if: { all: [] }, then: '' } as ValueExpression;
    case 'list':
      return [];
  }
};

// The literal as written: `{ value, coerceType }`'s value, or the bare value.
const literalOf = (expr: unknown): { value: unknown; coerceType?: FieldKind } => {
  if (expr !== null && typeof expr === 'object' && !Array.isArray(expr) && 'value' in expr)
    return expr as { value: unknown; coerceType?: FieldKind };
  return { value: expr };
};

const typeOf = (expr: unknown, view: LensView): ValueType | null => {
  try {
    return inferValueType(expr as ValueExpression, view.lens);
  } catch {
    return null;
  }
};

// The lens-gate issues for the row paths a node reads: a path, a relation and everything below it.
const gateIssuesFor = (ctx: Ctx, reads: (string | undefined)[]): ValidationIssue[] => {
  const mine = ctx.gateIssues.filter((issue) =>
    reads.some((read) => read && (issue.path === read || issue.path.startsWith(`${read}.`))),
  );
  for (const issue of mine) ctx.claimed.add(issue);
  return mine;
};

// The issues at `at` and below, minus those a child node owns.
const issuesAt = (ctx: Ctx, at: string, childPaths: string[]): ValidationIssue[] =>
  ctx.issues.filter(
    (issue) =>
      (issue.path === at || issue.path.startsWith(`${at}.`) || issue.path.startsWith(`${at}[`)) &&
      !childPaths.some(
        (child) =>
          issue.path === child ||
          issue.path.startsWith(`${child}.`) ||
          issue.path.startsWith(`${child}[`),
      ),
  );

// A value aggregate is an aggregate rule without its comparison: the condition builder edits it
// with a placeholder comparison, and every write drops it again.
const COMPARISON = { operator: 'greaterThan', value: 0 };
const withoutComparison = (rule: Condition): ValueExpression => {
  const { operator: _o, value: _v, __id: _i, ...rest } = rule as Rec;
  return rest as ValueExpression;
};

const build = (expr: ValueExpression, path: ValuePath, depth: number, ctx: Ctx): ValueNode => {
  const shape = shapeOf(expr) ?? 'literal';
  const at = issuePathOf(path);
  const write = (next: ValueExpression | undefined) => ctx.commit(setValueAt(ctx.root, path, next));
  const base = (childPaths: string[]): ValueNodeBase => ({
    id: path.length ? path.join('.') : 'root',
    path,
    depth,
    shape: {
      value: shape,
      options: ctx.shapes
        .filter((s) => depth < ctx.maxDepth || s === 'literal' || s === 'source')
        .map((s) => opt(s)),
      set: (next) => write(defaultForShape(next)),
    },
    type: typeOf(expr, ctx.view),
    issues: issuesAt(ctx, at, childPaths),
  });

  if (shape === 'literal' || (shape === 'source' && 'value' in (expr as Rec))) {
    const literal = literalOf(expr);
    const stamp =
      ctx.expectedKind && COERCED_KINDS.includes(ctx.expectedKind) ? ctx.expectedKind : undefined;
    return {
      ...base([]),
      shape: { ...base([]).shape, value: 'literal' },
      kind: 'literal',
      value: literal.value,
      coerceType: literal.coerceType ?? stamp,
      // A string the target reads as a date or number names its kind; anything else is bare,
      // and an object literal keeps the `{ value }` wrapper json-rules requires.
      set: (value) =>
        write(
          (stamp && typeof value === 'string'
            ? { value, coerceType: stamp }
            : value !== null && typeof value === 'object' && !(value instanceof Date)
              ? { value }
              : value) as ValueExpression,
        ),
    };
  }

  if (shape === 'source') {
    const rec = expr as Rec;
    const mode: 'path' | 'bind' = typeof rec.bind === 'string' ? 'bind' : 'path';
    const values = lensScopeSurface(ctx.view.lens).values;
    return {
      ...base([]),
      issues: [...base([]).issues, ...gateIssuesFor(ctx, [rec.path as string | undefined])],
      kind: 'source',
      mode: {
        value: mode,
        options: ctx.bindings ? [opt('path'), opt('bind')] : [opt('path')],
        set: (next) => write((next === 'bind' ? { bind: '' } : { path: '' }) as ValueExpression),
      },
      sourcePath:
        mode === 'path'
          ? {
              value: rec.path as string | undefined,
              options: values.map((v) => opt(v.path, v.label)),
              set: (p) => write({ path: p } as ValueExpression),
            }
          : undefined,
      bindName:
        mode === 'bind' && ctx.bindings
          ? {
              value: rec.bind as string | undefined,
              set: (b) => write({ bind: b } as ValueExpression),
            }
          : undefined,
    };
  }

  if (shape === 'aggregate') {
    const rec = expr as Rec;
    const agg = (rec.aggregate ?? {}) as { mode?: ValueAggregateMode; field?: string };
    const list = buildRoot(
      {
        ...rec,
        ...COMPARISON,
        aggregate: { mode: 'sum', ...(agg.field ? { field: agg.field } : {}) },
      } as Condition,
      ctx.view,
      ctx.fields,
      ctx.maxDepth,
      (next) =>
        write({
          ...(withoutComparison(next) as Rec),
          aggregate: { ...agg, ...((next as Rec).aggregate as object), mode: agg.mode ?? 'count' },
        } as ValueExpression),
      { surfaceOpts: ctx.surfaceOpts },
    ) as ArrayNode;
    const listPath = typeof rec.field === 'string' ? rec.field : '';
    const itemFields = listPath
      ? describeScopeFields(viewAt(viewRoot(ctx.view), listPath), ctx.surfaceOpts).filter(
          (f) => !f.relation && !f.isList,
        )
      : [];
    const itemField = itemFields.find((f) => f.name === agg.field);
    const modes = (
      itemField ? aggregateModesForKind(itemField.kind) : ['count']
    ) as ValueAggregateMode[];
    return {
      ...base([]),
      issues: [
        ...base([]).issues,
        ...gateIssuesFor(ctx, [
          listPath,
          agg.field && listPath ? `${listPath}.${agg.field}` : undefined,
        ]),
      ],
      kind: 'aggregate',
      list,
      mode: {
        value: agg.mode ?? 'count',
        options: VALUE_AGGREGATE_MODES.filter((m) => modes.includes(m)).map((m) => opt(m)),
        set: (m) => write({ ...rec, aggregate: { ...agg, mode: m } } as ValueExpression),
      },
      field: itemFields.length
        ? {
            value: agg.field,
            options: itemFields.map((f) => opt(f.name, f.label)),
            // A new column may not take the current mode: count of rows is always valid.
            set: (field) => {
              const kind = itemFields.find((f) => f.name === field)?.kind;
              const keep = kind && agg.mode && aggregateModesForKind(kind).includes(agg.mode);
              write({
                ...rec,
                aggregate: { mode: keep ? agg.mode : 'count', ...(field ? { field } : {}) },
              } as ValueExpression);
            },
          }
        : undefined,
    };
  }

  if (shape === 'if') {
    const rec = expr as Rec;
    const thenPath: ValuePath = [...path, 'then'];
    const elsePath: ValuePath = [...path, 'else'];
    return {
      ...base([`${at}.if`, issuePathOf(thenPath), issuePathOf(elsePath)]),
      kind: 'if',
      if: buildRoot(
        (rec.if ?? { all: [] }) as Condition,
        ctx.view,
        ctx.fields,
        ctx.maxDepth,
        (next) => write({ ...rec, if: next } as ValueExpression),
        { surfaceOpts: ctx.surfaceOpts },
      ),
      then: build(rec.then as ValueExpression, thenPath, depth + 1, ctx),
      else:
        rec.else !== undefined
          ? build(rec.else as ValueExpression, elsePath, depth + 1, ctx)
          : undefined,
      addElse:
        rec.else === undefined ? () => write({ ...rec, else: '' } as ValueExpression) : undefined,
      removeElse:
        rec.else !== undefined
          ? () => ctx.commit(setValueAt(ctx.root, elsePath, undefined))
          : undefined,
    };
  }

  // list
  const items = listItems(expr) as ValueExpression[];
  const distinct = !Array.isArray(expr) && (expr as Rec).distinct === true;
  const itemPaths = items.map((_, i) => [...path, i] as ValuePath);
  return {
    ...base(itemPaths.map((p) => issuePathOf(p))),
    kind: 'list',
    items: items.map((item, i) => ({
      ...build(item, itemPaths[i], depth + 1, ctx),
      remove: () => ctx.commit(setValueAt(ctx.root, itemPaths[i], undefined)),
    })),
    addItem: () =>
      write(
        (distinct ? { list: [...items, ''], distinct: true } : [...items, '']) as ValueExpression,
      ),
    distinct: {
      value: distinct,
      set: (next) => write((next ? { list: items, distinct: true } : items) as ValueExpression),
    },
  };
};

/**
 * The headless descriptor tree of a value expression (json-rules `evaluateValue`'s grammar): one
 * node per value, each with its shape picker, its inferred type and json-rules' issues at it.
 * An `if`'s condition and an aggregate's element condition, filter and ordering are the
 * condition builder's own nodes. Pure: every action computes the next expression and calls
 * `commit`.
 */
export const buildValueExpressionRoot = (
  expression: ValueExpression | undefined,
  opts: ValueBuilderOptions,
): ValueNode => {
  const root = expression === undefined ? defaultForShape('literal') : expression;
  const ctx: Ctx = {
    root,
    view: opts.view,
    fields: opts.fields,
    maxDepth: opts.maxDepth ?? 4,
    commit: opts.commit,
    bindings: opts.bindings ?? true,
    shapes: opts.shapes ?? VALUE_SHAPES,
    expectedKind: opts.expectedKind,
    acceptsType: opts.acceptsType,
    surfaceOpts: opts.surfaceOpts ?? {},
    issues: [],
    gateIssues: [],
    claimed: new Set(),
  };
  for (const issue of describeValue(root, opts.view.lens).errors)
    (issue.path.startsWith('$') ? ctx.issues : ctx.gateIssues).push(issue);
  const built = build(root, [], 0, ctx);
  // A gate issue no node reads stays on the whole value.
  const unclaimed = ctx.gateIssues.filter((issue) => !ctx.claimed.has(issue));
  const node = unclaimed.length ? { ...built, issues: [...built.issues, ...unclaimed] } : built;
  return ctx.acceptsType && node.type ? { ...node, accepted: ctx.acceptsType(node.type) } : node;
};
