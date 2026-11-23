import {
  listItems,
  type ValueExpression,
  type ValueExpressionShape,
  valueExpressionShape,
} from '@inixiative/json-rules';

/** A slot in a value expression: an `if`'s `then` / `else`, or a list item by index. The
 *  segments json-rules' value grammar has (`if` itself holds a condition, edited by the
 *  condition builder). */
export type ValuePathSegment = 'then' | 'else' | number;
export type ValuePath = ValuePathSegment[];

type Rec = Record<string, unknown>;

/** The JSON path json-rules reports a value's issues at: `$`, `$.then`, `$[2]`, … */
export const issuePathOf = (path: ValuePath, base = '$'): string =>
  path.reduce<string>(
    (at, seg) => (typeof seg === 'number' ? `${at}[${seg}]` : `${at}.${seg}`),
    base,
  );

/** An issue's path read as json-rules prefixes one (`validateValue`'s `prefixed`): a lens-gate
 *  issue names its field bare (`owner.nope`), anything else from `$`. Placed under `base`. */
export const issuePathUnder = (issuePath: string, base = '$'): string =>
  issuePath.startsWith('$') ? `${base}${issuePath.slice(1)}` : `${base}.${issuePath}`;

/** The value at `path`, or undefined where the expression has none. */
export const valueAt = (expr: ValueExpression, path: ValuePath): ValueExpression | undefined => {
  let at: unknown = expr;
  for (const seg of path) {
    if (at === undefined) return undefined;
    if (typeof seg === 'number') at = listItems(at)[seg];
    else at = (at as Rec)[seg];
  }
  return at as ValueExpression | undefined;
};

/** `expr` with the value at `path` replaced (or, given undefined, an `else` dropped / a list item
 *  removed). Non-mutating. */
export const setValueAt = (
  expr: ValueExpression,
  path: ValuePath,
  next: ValueExpression | undefined,
): ValueExpression => {
  if (path.length === 0) return next as ValueExpression;
  const [seg, ...rest] = path;
  if (typeof seg === 'number') {
    const items = listItems(expr).slice();
    if (rest.length === 0 && next === undefined) items.splice(seg, 1);
    else items[seg] = setValueAt(items[seg] as ValueExpression, rest, next);
    return Array.isArray(expr)
      ? (items as ValueExpression)
      : ({ ...(expr as Rec), list: items } as ValueExpression);
  }
  const rec = expr as Rec;
  if (rest.length === 0 && next === undefined) {
    const { [seg]: _drop, ...without } = rec;
    return without as ValueExpression;
  }
  return { ...rec, [seg]: setValueAt(rec[seg] as ValueExpression, rest, next) } as ValueExpression;
};

/** The shape a value is, json-rules' own reading (`literal` for a bare scalar, `source` for
 *  `{ value }` / `{ path }` / `{ bind }`). */
export const shapeOf = (expr: unknown): ValueExpressionShape | null => valueExpressionShape(expr);
