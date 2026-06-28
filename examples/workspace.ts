import type { Bridge, Condition, FieldMap, LensNarrowing } from '@inixiative/json-rules';
import type { WorkspaceSource } from './sourceExec';

/** A saved lens bundles its anchor + attached bridges with the narrowing so it loads standalone. */
export type SavedLens = {
  mapName: string;
  model: string;
  /** Bridges this lens activates — the cross-map edges reachable through it. */
  bridges?: Bridge[];
  narrowing?: Omit<LensNarrowing, 'parent'>;
};

export type Workspace = {
  maps: Record<string, FieldMap>;
  bridges: Bridge[];
  narrowings: Record<string, SavedLens>;
  sources: WorkspaceSource[]; // field option sets — DISTINCT(column) under a `where`
  rule: Condition;
};

export const emptyWorkspace = (): Workspace => ({
  maps: {},
  bridges: [],
  narrowings: {},
  sources: [],
  rule: { all: [] },
});

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
  if ('narrowings' in parsed) {
    if (!isPlainObject(parsed.narrowings))
      throw new Error('importWorkspace: narrowings must be an object');
    ws.narrowings = parsed.narrowings as Record<string, SavedLens>;
  }
  if ('sources' in parsed) {
    if (!Array.isArray(parsed.sources))
      throw new Error('importWorkspace: sources must be an array');
    ws.sources = parsed.sources as WorkspaceSource[];
  }
  if ('rule' in parsed && parsed.rule !== undefined) {
    ws.rule = parsed.rule as Condition;
  }
  return ws;
};
