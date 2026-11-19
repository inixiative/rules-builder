import {
  type Categorization,
  type CategorizationDescription,
  type CategorizationMatch,
  type Condition,
  describeCategorization,
  describeValue,
  type ValidationIssue,
  type ValueExpression,
  type ValueType,
} from '@inixiative/json-rules';
import { type BuilderNode, buildRoot, type PickOption } from '../builder/buildNodes';
import {
  buildValueExpressionRoot,
  type ValueBuilderOptions,
  type ValueNode,
} from './buildValueExpressionRoot';
import { issuePathUnder } from './valueTree';

/** One case: the condition it holds on, and the value it gives. */
export type CategoryNode = {
  id: string;
  index: number;
  if: BuilderNode;
  then: ValueNode;
  /** json-rules' issues at this case that are not its condition's or value's own (a value whose
   *  type disagrees with the cases before it). */
  issues: ValidationIssue[];
  moveUp?: () => void;
  moveDown?: () => void;
  remove: () => void;
};

export type CategorizationNode = {
  cases: CategoryNode[];
  addCase: () => void;
  match: {
    value: CategorizationMatch;
    options: PickOption[];
    set: (match: CategorizationMatch) => void;
  };
  /** The value when no case holds; absent means null (`[]` under `match: 'all'`). */
  default?: ValueNode;
  addDefault?: () => void;
  removeDefault?: () => void;
  /** The type `categorize` returns, and the caller's `acceptsType` of it. */
  type: ValueType | null;
  accepted?: boolean;
  /** json-rules' issues that sit on no case (a malformed categorization, the clock floor). */
  issues: ValidationIssue[];
  description: CategorizationDescription;
};

export type CategorizationBuilderOptions = Omit<ValueBuilderOptions, 'commit'> & {
  commit: (next: Categorization) => void;
};

const MATCH_OPTIONS: PickOption[] = [
  { value: 'first', label: 'first case that holds' },
  { value: 'all', label: 'every case that holds' },
];

const under = (issue: ValidationIssue, at: string) =>
  issue.path === at || issue.path.startsWith(`${at}.`) || issue.path.startsWith(`${at}[`);

const move = <T>(items: T[], from: number, to: number): T[] => {
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

/**
 * The headless descriptor tree of a json-rules categorization (`categorize`): ordered cases, each
 * a condition-builder root and a value-builder root; `match`; and `default`. Types and issues are
 * `describeCategorization`'s, placed at the case they name. Pure: every action computes the next
 * categorization and calls `commit`.
 */
export const buildCategorizationRoot = (
  categorization: Categorization | undefined,
  opts: CategorizationBuilderOptions,
): CategorizationNode => {
  const cat: Categorization = categorization ?? { cases: [] };
  const commit = opts.commit;
  const description = describeCategorization(cat, opts.view.lens);
  // A case value or the default is an ordinary value editor; the caller's type check is the
  // categorization's, not each value's.
  const valueOpts = (write: (next: ValueExpression) => void): ValueBuilderOptions => ({
    ...opts,
    commit: write,
    acceptsType: undefined,
  });
  // The issues at `at` that the categorization adds (a type that disagrees with the cases before
  // it, a list under `match: 'all'`): its issues there minus the value's own, which its node shows.
  const addedAt = (at: string, value: ValueExpression): ValidationIssue[] => {
    const own = new Set(
      describeValue(value, opts.view.lens).errors.map(
        (issue) => `${issuePathUnder(issue.path, at)}|${issue.code}`,
      ),
    );
    return description.errors.filter(
      (issue) => under(issue, at) && !own.has(`${issue.path}|${issue.code}`),
    );
  };
  const withCases = (cases: Categorization['cases']) => commit({ ...cat, cases });

  const cases = cat.cases.map((category, index): CategoryNode => {
    const at = `$.cases[${index}]`;
    const setCase = (next: Partial<Categorization['cases'][number]>) =>
      withCases(cat.cases.map((c, i) => (i === index ? { ...c, ...next } : c)));
    return {
      id: String(index),
      index,
      if: buildRoot(
        category.if,
        opts.view,
        opts.fields,
        opts.maxDepth ?? 4,
        (next: Condition) => setCase({ if: next }),
        { surfaceOpts: opts.surfaceOpts },
      ),
      then: buildValueExpressionRoot(
        category.then,
        valueOpts((next) => setCase({ then: next })),
      ),
      issues: [
        ...description.errors.filter((issue) => issue.path === at),
        ...addedAt(`${at}.then`, category.then),
      ],
      moveUp: index > 0 ? () => withCases(move(cat.cases, index, index - 1)) : undefined,
      moveDown:
        index < cat.cases.length - 1
          ? () => withCases(move(cat.cases, index, index + 1))
          : undefined,
      remove: () => withCases(cat.cases.filter((_, i) => i !== index)),
    };
  });

  return {
    cases,
    addCase: () => withCases([...cat.cases, { if: { all: [] }, then: '' }]),
    match: {
      value: cat.match ?? 'first',
      options: MATCH_OPTIONS,
      set: (match) => commit({ ...cat, match }),
    },
    default:
      cat.default !== undefined
        ? buildValueExpressionRoot(
            cat.default,
            valueOpts((next) => commit({ ...cat, default: next })),
          )
        : undefined,
    addDefault: cat.default === undefined ? () => commit({ ...cat, default: '' }) : undefined,
    removeDefault:
      cat.default !== undefined
        ? () => {
            const { default: _drop, ...rest } = cat;
            commit(rest);
          }
        : undefined,
    type: description.type,
    accepted: opts.acceptsType && description.type ? opts.acceptsType(description.type) : undefined,
    issues: [
      ...description.errors.filter(
        (issue) => !issue.path.startsWith('$.cases[') && !under(issue, '$.default'),
      ),
      ...(cat.default !== undefined ? addedAt('$.default', cat.default) : []),
    ],
    description,
  };
};
