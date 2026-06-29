import type {
  Bridge,
  Condition,
  FieldMap,
  FieldMapEntry,
  ModelNarrowing,
  SourceValues,
} from '@inixiative/json-rules';
import { useState } from 'react';
import { RuleEditor } from '../RuleTree';
import { Badge, Button, Row, Select, tokens } from '../ui';

// sourceValues are folded into the where-editor's surface so it renders pseudo-enum selects.
export type NodeCtx = {
  maps: Record<string, FieldMap>;
  bridges: Bridge[];
  sourceValues: SourceValues[];
  maxDepth: number;
};

const relTarget = (entry: FieldMapEntry, currentMap: string): { map: string; model: string } | null => {
  if (entry.kind === 'object') return { map: currentMap, model: entry.type };
  if (entry.kind === 'bridge') {
    const [m, n] = entry.type.includes(':') ? entry.type.split(':') : [currentMap, entry.type];
    return { map: m ?? currentMap, model: n ?? entry.type };
  }
  return null;
};

const isEmptyCond = (c: Condition | undefined): boolean =>
  !!c && typeof c === 'object' && 'all' in c && Array.isArray(c.all) && c.all.length === 0;

const FieldVisibility = ({
  fields,
  value,
  onChange,
}: {
  fields: string[];
  value: ModelNarrowing;
  onChange: (v: ModelNarrowing) => void;
}) => {
  const mode = value.picks ? 'picks' : value.omits ? 'omits' : 'none';
  const setMode = (m: 'none' | 'picks' | 'omits') =>
    onChange({
      ...value,
      picks: m === 'picks' ? (value.picks ?? []) : undefined,
      omits: m === 'omits' ? (value.omits ?? []) : undefined,
    });
  const active = mode === 'picks' ? value.picks ?? [] : mode === 'omits' ? value.omits ?? [] : [];
  const toggle = (f: string) => {
    if (mode === 'none') return;
    const key = mode === 'picks' ? 'picks' : 'omits';
    const list = active.includes(f) ? active.filter((x) => x !== f) : [...active, f];
    onChange({ ...value, [key]: list });
  };
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <Row>
        <strong style={{ fontSize: 12 }}>field visibility</strong>
        <Select
          ariaLabel="field visibility"
          value={mode}
          onChange={(v) => setMode(v as 'none' | 'picks' | 'omits')}
          options={[
            { value: 'none', label: 'none' },
            { value: 'picks', label: 'picks' },
            { value: 'omits', label: 'omits' },
          ]}
          style={{ fontSize: 12, padding: '3px 6px' }}
        />
      </Row>
      {mode !== 'none' && (
        <Row>
          {fields.map((f) => (
            <label key={f} style={{ fontSize: 12, fontFamily: 'monospace' }}>
              <input type="checkbox" checked={active.includes(f)} onChange={() => toggle(f)} /> {f}
            </label>
          ))}
        </Row>
      )}
    </div>
  );
};

const EnumNarrowingEditor = ({
  map,
  model,
  value,
  onChange,
}: {
  map: FieldMap;
  model: string;
  value: ModelNarrowing;
  onChange: (v: ModelNarrowing) => void;
}) => {
  const enumFields = Object.entries(map.models[model].fields).filter(([, e]) => e.kind === 'enum');
  if (enumFields.length === 0) return null;
  const valuesFor = (e: FieldMapEntry): readonly string[] => e.values ?? map.enums?.[e.type] ?? [];

  const setFor = (
    field: string,
    op: 'enumPicks' | 'enumOmits' | 'none',
    vals: readonly string[],
  ) => {
    const enumPicks = { ...(value.enumPicks ?? {}) };
    const enumOmits = { ...(value.enumOmits ?? {}) };
    delete enumPicks[field];
    delete enumOmits[field];
    if (op === 'enumPicks') enumPicks[field] = vals;
    if (op === 'enumOmits') enumOmits[field] = vals;
    onChange({
      ...value,
      enumPicks: Object.keys(enumPicks).length ? enumPicks : undefined,
      enumOmits: Object.keys(enumOmits).length ? enumOmits : undefined,
    });
  };

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <strong style={{ fontSize: 12 }}>enum values</strong>
      {enumFields.map(([name, entry]) => {
        const mode = value.enumPicks?.[name] ? 'enumPicks' : value.enumOmits?.[name] ? 'enumOmits' : 'none';
        const active = (mode === 'enumPicks' ? value.enumPicks?.[name] : value.enumOmits?.[name]) ?? [];
        const toggle = (v: string) => {
          if (mode === 'none') return;
          const next = active.includes(v) ? active.filter((x) => x !== v) : [...active, v];
          setFor(name, mode, next);
        };
        return (
          <Row key={name}>
            <span style={{ fontFamily: 'monospace', fontSize: 12, minWidth: 90 }}>{name}</span>
            <Select
              ariaLabel={`${name} enum mode`}
              value={mode}
              onChange={(v) => setFor(name, v as 'enumPicks' | 'enumOmits' | 'none', [])}
              options={[
                { value: 'none', label: '—' },
                { value: 'enumPicks', label: 'pick' },
                { value: 'enumOmits', label: 'omit' },
              ]}
              style={{ fontSize: 12, padding: '3px 6px' }}
            />
            {mode !== 'none' &&
              valuesFor(entry).map((v) => (
                <label key={v} style={{ fontSize: 12 }}>
                  <input type="checkbox" checked={active.includes(v)} onChange={() => toggle(v)} /> {v}
                </label>
              ))}
          </Row>
        );
      })}
    </div>
  );
};

export const NarrowingNode = ({
  ctx,
  mapName,
  model,
  value,
  onChange,
  depth,
  allowRelations,
}: {
  ctx: NodeCtx;
  mapName: string;
  model: string;
  value: ModelNarrowing;
  onChange: (v: ModelNarrowing) => void;
  depth: number;
  allowRelations: boolean;
}) => {
  const [showWhere, setShowWhere] = useState(!isEmptyCond(value.where) && value.where !== undefined);
  const map = ctx.maps[mapName];
  if (!map?.models[model]) return <Badge tone="danger">missing {mapName}.{model}</Badge>;

  const fieldEntries = Object.entries(map.models[model].fields);
  const fieldNames = fieldEntries.map(([n]) => n);
  const relations = fieldEntries.filter(([, e]) => e.kind === 'object' || e.kind === 'bridge');

  const setRelation = (rel: string, sub: ModelNarrowing | null) => {
    const next = { ...(value.relations ?? {}) };
    if (sub === null) delete next[rel];
    else next[rel] = sub;
    onChange({ ...value, relations: Object.keys(next).length ? next : undefined });
  };

  const setSource = (field: string, where: Condition | null) => {
    const next = { ...(value.sources ?? {}) };
    if (where === null) delete next[field];
    else next[field] = where;
    onChange({ ...value, sources: Object.keys(next).length ? next : undefined });
  };
  const sources = value.sources ?? {};
  const addableSourceFields = fieldEntries.filter(
    ([n, e]) => e.kind !== 'object' && e.kind !== 'bridge' && !sources[n],
  );

  return (
    <div
      style={{
        border: `1px solid ${depth === 0 ? tokens.borderStrong : tokens.border}`,
        borderRadius: tokens.radius,
        padding: 12,
        display: 'grid',
        gap: 10,
        background: depth % 2 === 1 ? tokens.bgMuted : tokens.bg,
      }}
    >
      <Badge tone="accent">
        {mapName}.{model}
      </Badge>

      <FieldVisibility fields={fieldNames} value={value} onChange={onChange} />
      <EnumNarrowingEditor map={map} model={model} value={value} onChange={onChange} />

      <div style={{ display: 'grid', gap: 6 }}>
        <Row>
          <strong style={{ fontSize: 12 }}>where (data filter)</strong>
          <Button variant="ghost" onClick={() => setShowWhere((s) => !s)}>
            {showWhere ? 'hide' : 'edit'}
          </Button>
          {!isEmptyCond(value.where) && value.where !== undefined && <Badge tone="ok">set</Badge>}
        </Row>
        {showWhere && (
          <RuleEditor
            source={{ maps: ctx.maps, bridges: ctx.bridges, mapName, model }}
            sourceValues={ctx.sourceValues}
            maxDepth={ctx.maxDepth}
            rule={value.where && typeof value.where === 'object' ? value.where : { all: [] }}
            onChange={(where) => onChange({ ...value, where: isEmptyCond(where) ? undefined : where })}
          />
        )}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <Row>
          <strong style={{ fontSize: 12 }}>sources (data-backed options)</strong>
          <Select
            ariaLabel="add source field"
            value=""
            placeholder="add field…"
            onChange={(f) => f && setSource(f, { all: [] })}
            options={addableSourceFields.map(([n]) => ({ value: n, label: n }))}
            style={{ fontSize: 12, padding: '3px 6px' }}
          />
        </Row>
        {Object.entries(sources).map(([field, where]) => (
          <div key={field} style={{ border: `1px dashed ${tokens.borderStrong}`, borderRadius: 6, padding: 8, display: 'grid', gap: 6 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Badge tone="accent">{field}</Badge>
              <Button variant="danger" onClick={() => setSource(field, null)}>
                remove
              </Button>
            </Row>
            <span style={{ fontSize: 11, color: tokens.textMuted }}>
              options = DISTINCT <code>{field}</code> where this holds
            </span>
            <RuleEditor
              source={{ maps: ctx.maps, bridges: ctx.bridges, mapName, model }}
              sourceValues={ctx.sourceValues}
              maxDepth={ctx.maxDepth}
              rule={where && typeof where === 'object' ? where : { all: [] }}
              onChange={(w) => setSource(field, w)}
            />
          </div>
        ))}
      </div>

      {allowRelations && relations.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          <strong style={{ fontSize: 12 }}>relations</strong>
          {relations.map(([rel, entry]) => {
            const target = relTarget(entry, mapName);
            const child = value.relations?.[rel];
            if (!target) return null;
            return (
              <div key={rel} style={{ display: 'grid', gap: 6 }}>
                <Row>
                  <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {rel} → {target.map}.{target.model}
                  </span>
                  {child ? (
                    <Button variant="danger" onClick={() => setRelation(rel, null)}>
                      remove
                    </Button>
                  ) : (
                    <Button onClick={() => setRelation(rel, {})} disabled={depth >= 3} title="add a narrowing scoped to this relation">
                      extend →
                    </Button>
                  )}
                </Row>
                {child && (
                  <NarrowingNode
                    ctx={ctx}
                    mapName={target.map}
                    model={target.model}
                    value={child}
                    onChange={(sub) => setRelation(rel, sub)}
                    depth={depth + 1}
                    allowRelations={allowRelations}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
