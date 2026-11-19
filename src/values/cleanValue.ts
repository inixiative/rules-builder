import {
  type Categorization,
  type Condition,
  coerceRule,
  coerceValue,
  type Lens,
  type LensNarrowing,
  listItems,
  type ValueExpression,
} from '@inixiative/json-rules';
import { stripMeta, trimEmptyGroups } from '../core';
import { shapeOf } from './valueTree';

type Rec = Record<string, unknown>;

const cleanCondition = (condition: Condition, lens: Lens | LensNarrowing): Condition =>
  coerceRule(stripMeta(trimEmptyGroups(condition) ?? true), lens);

// Each condition a value holds, cleaned as the rule builder cleans one: editor metadata off, the
// coercion stamped from the lens. An aggregate's element condition and filter are coerced in the
// relation's scope by coercing it as the aggregate rule it is, then dropping the comparison.
const cleanAt = (expr: ValueExpression, lens: Lens | LensNarrowing): ValueExpression => {
  const rec = expr as Rec;
  switch (shapeOf(expr)) {
    case 'if':
      return {
        ...rec,
        if: cleanCondition(rec.if as Condition, lens),
        then: cleanAt(rec.then as ValueExpression, lens),
        ...(rec.else !== undefined ? { else: cleanAt(rec.else as ValueExpression, lens) } : {}),
      } as ValueExpression;
    case 'list': {
      const items = listItems(expr).map((item) => cleanAt(item as ValueExpression, lens));
      return (Array.isArray(expr) ? items : { ...rec, list: items }) as ValueExpression;
    }
    case 'aggregate': {
      const asRule = stripMeta({ ...rec, operator: 'greaterThan', value: 0 } as Condition);
      const { operator: _o, value: _v, ...coerced } = coerceRule(asRule, lens) as Rec;
      return coerced as ValueExpression;
    }
    default:
      return expr;
  }
};

/** A value expression as the editor emits it: editor metadata off, every condition it holds
 *  coerced from the lens (`coerceRule`), and its aggregates stamped (`coerceValue`). */
export const cleanValue = (expr: ValueExpression, lens: Lens | LensNarrowing): ValueExpression => {
  const cleaned = cleanAt(expr, lens);
  try {
    return coerceValue(cleaned, lens);
  } catch {
    // A value json-rules can't read yet (mid-edit) is emitted as written; its issues show.
    return cleaned;
  }
};

/** A categorization as the editor emits it: each case's condition and value cleaned, and the
 *  default. */
export const cleanCategorization = (
  categorization: Categorization,
  lens: Lens | LensNarrowing,
): Categorization => ({
  ...categorization,
  cases: categorization.cases.map((category) => ({
    if: cleanCondition(category.if, lens),
    then: cleanValue(category.then, lens),
  })),
  ...(categorization.default !== undefined
    ? { default: cleanValue(categorization.default, lens) }
    : {}),
});
