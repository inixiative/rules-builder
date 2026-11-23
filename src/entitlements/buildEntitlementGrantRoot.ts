import type { Condition, ModelNarrowing } from '@inixiative/json-rules';
import { type BuilderNode, buildRoot } from '../builder/buildNodes';
import { describeScopeFields, type LensView, viewRoot } from '../schema/surface';

/** One node of a grantable operation tree: the part of signet's `OperationNode` this editor reads
 *  (signet's own nodes pass as they are). */
export type OperationTreeNode = {
  key: string;
  segment: string;
  leaf: boolean;
  children: readonly OperationTreeNode[];
};

/** An operation the grant may hold: offered and chosen by the caller, toggled through it. */
export type OperationChoiceNode = {
  key: string;
  label: string;
  leaf: boolean;
  /** The caller may grant it (the grantor holds it, the catalog allows it). */
  offered: boolean;
  chosen: boolean;
  /** Some, not all, of its descendants are chosen. */
  partly: boolean;
  /** Present when offered. */
  toggle?: () => void;
  children: OperationChoiceNode[];
};

export type EntitlementGrantOptions = {
  /** The grant's operations: the caller's tree, what it offers and has chosen, and how a toggle
   *  changes its picks (signet's pick arithmetic stays with the caller). */
  operations?: {
    tree: readonly OperationTreeNode[];
    offered: (key: string) => boolean;
    chosen: (key: string) => boolean;
    toggle: (key: string) => void;
  };
  /** The conditions this grant adds to what is held, over the caller's where lens. Positive
   *  only: an entitlement's `where` never holds on a missing value. The caller composes it with
   *  the held conditions (permissions' `delegatedWhere`). */
  where?: {
    view: LensView;
    held: readonly Condition[];
    value?: Condition;
    commit: (next: Condition) => void;
    maxDepth?: number;
  };
  /** The grant's one narrowing over the lens chain it inherits, checked by the caller (Kingdom
   *  composes it over the generated operations lens with signet's `composeGrantLensChain`). */
  lens?: {
    value?: ModelNarrowing;
    validate: (narrowing: ModelNarrowing) => { ok: boolean; errors: readonly unknown[] };
    commit: (next: ModelNarrowing | undefined) => void;
  };
};

export type EntitlementGrantNode = {
  operations?: OperationChoiceNode[];
  where?: { added: BuilderNode; held: readonly Condition[] };
  lens?: {
    value?: ModelNarrowing;
    validation: { ok: boolean; errors: readonly unknown[] };
    set: (next: ModelNarrowing | undefined) => void;
  };
};

const choiceOf = (
  node: OperationTreeNode,
  ops: NonNullable<EntitlementGrantOptions['operations']>,
): OperationChoiceNode => {
  const children = node.children.map((child) => choiceOf(child, ops));
  const chosenHere = ops.chosen(node.key);
  const allChildren = children.length > 0 && children.every((c) => c.chosen);
  const someChildren = children.some((c) => c.chosen || c.partly);
  const offered = ops.offered(node.key);
  return {
    key: node.key,
    label: node.segment,
    leaf: node.leaf,
    offered,
    chosen: chosenHere || allChildren,
    partly: !chosenHere && !allChildren && someChildren,
    toggle: offered ? () => ops.toggle(node.key) : undefined,
    children,
  };
};

/**
 * The headless descriptor of an entitlement grant's three parts, each optional: the operations it
 * holds (over the caller's operation tree), the conditions it adds (a positive condition builder
 * over the caller's where lens, the held ones read-only beside it), and its narrowing (checked by
 * the caller's lens validator). Pure.
 */
export const buildEntitlementGrantRoot = (opts: EntitlementGrantOptions): EntitlementGrantNode => {
  const where = opts.where;
  const surfaceOpts = { positive: true };
  return {
    operations: opts.operations
      ? opts.operations.tree.map((node) => choiceOf(node, opts.operations!))
      : undefined,
    where: where
      ? {
          added: buildRoot(
            where.value ?? { all: [] },
            where.view,
            describeScopeFields(viewRoot(where.view), surfaceOpts),
            where.maxDepth ?? 4,
            where.commit,
            { surfaceOpts },
          ),
          held: where.held,
        }
      : undefined,
    lens: opts.lens
      ? {
          value: opts.lens.value,
          validation: opts.lens.value
            ? opts.lens.validate(opts.lens.value)
            : { ok: true, errors: [] },
          set: opts.lens.commit,
        }
      : undefined,
  };
};
