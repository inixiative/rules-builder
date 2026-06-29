import {
  type Bridge,
  type Condition,
  createLens,
  type FieldMap,
  type Lens,
  type LensNarrowing,
} from '@inixiative/json-rules';

/** A narrowing's parent — a lens or another narrowing, by name. */
export type ParentRef = { kind: 'lens' | 'narrowing'; name: string };

/** A lens: an anchor (map.model) + attached bridges. The base reference view — no restrictions. */
export type SavedLens = { mapName: string; model: string; bridges?: Bridge[] };

/** A narrowing: picks a parent (lens or narrowing) + a restriction chain (picks/omits/where/enum/sources/relations).
 *  Restricts the parent's exposed surface — never widens. Chains. */
export type SavedNarrowing = { parent: ParentRef; narrowing: Omit<LensNarrowing, 'parent'> };

export type Workspace = {
  maps: Record<string, FieldMap>;
  bridges: Bridge[];
  lenses: Record<string, SavedLens>;
  narrowings: Record<string, SavedNarrowing>;
  rule: Condition; // the working draft in the builder
  rules: Record<string, Condition>; // saved, named rules
};

export const emptyWorkspace = (): Workspace => ({
  maps: {},
  bridges: [],
  lenses: {},
  narrowings: {},
  rule: { all: [] },
  rules: {},
});

/** Resolve a parent ref to a usable Lens | LensNarrowing, recursively through the chain. */
export const resolveRef = (
  ws: Workspace,
  ref: ParentRef,
  seen: Set<string> = new Set(),
): Lens | LensNarrowing | null => {
  const key = `${ref.kind}:${ref.name}`;
  if (seen.has(key)) return null; // cycle guard
  const next = new Set(seen).add(key);
  if (ref.kind === 'lens') {
    const l = ws.lenses[ref.name];
    if (!l) return null;
    return createLens({ maps: ws.maps, bridges: l.bridges ?? [], mapName: l.mapName, model: l.model });
  }
  const n = ws.narrowings[ref.name];
  if (!n) return null;
  const parent = resolveRef(ws, n.parent, next);
  if (!parent) return null;
  return { parent, ...n.narrowing };
};

export const exportWorkspace = (ws: Workspace): string => JSON.stringify(ws, null, 2);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const importWorkspace = (json: string): Workspace => {
  const parsed: unknown = JSON.parse(json);
  if (!isPlainObject(parsed)) throw new Error('importWorkspace: root must be an object');
  const ws = emptyWorkspace();

  if ('maps' in parsed) {
    if (!isPlainObject(parsed.maps)) throw new Error('importWorkspace: maps must be an object');
    ws.maps = parsed.maps as Record<string, FieldMap>;
  }
  if ('bridges' in parsed) {
    if (!Array.isArray(parsed.bridges)) throw new Error('importWorkspace: bridges must be an array');
    ws.bridges = parsed.bridges as Bridge[];
  }
  if ('lenses' in parsed) {
    if (!isPlainObject(parsed.lenses)) throw new Error('importWorkspace: lenses must be an object');
    ws.lenses = parsed.lenses as Record<string, SavedLens>;
  }
  if ('narrowings' in parsed) {
    if (!isPlainObject(parsed.narrowings)) throw new Error('importWorkspace: narrowings must be an object');
    ws.narrowings = parsed.narrowings as Record<string, SavedNarrowing>;
  }
  if ('rule' in parsed && parsed.rule !== undefined) {
    ws.rule = parsed.rule as Condition;
  }
  if ('rules' in parsed && isPlainObject(parsed.rules)) {
    ws.rules = parsed.rules as Record<string, Condition>;
  }
  return ws;
};
