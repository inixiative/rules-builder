import { createLens, exposedSurface } from '@inixiative/json-rules';
import { useMemo, useState } from 'react';
import { lensValuePicker } from '../../src/schema/lensValuePicker';
import { Badge, Code, Empty, Panel, Row, Select, tokens } from '../ui';
import { type ParentRef, resolveRef } from '../workspace';
import type { TabProps } from './types';

const sel: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: 6,
  border: `1px solid ${tokens.borderStrong}`,
  fontSize: 13,
};

const parseRef = (v: string): ParentRef => {
  const i = v.indexOf(':');
  return { kind: v.slice(0, i) as 'lens' | 'narrowing', name: v.slice(i + 1) };
};

/**
 * The lens value picker (`lensValuePicker`) — the shared atom behind a rule's `field`
 * (LHS) and `path` (RHS reference). Pick a lens/narrowing → fieldMap → model; the chosen
 * narrowing scopes (reduces) what's offered. A `Json` column is flagged `acceptsSubPath`,
 * so a freeform sub-path input appears.
 */
export const PathPickerTab = ({ ws }: TabProps) => {
  const firstMap = Object.keys(ws.maps)[0] ?? '';
  const firstModel = firstMap ? (Object.keys(ws.maps[firstMap]?.models ?? {})[0] ?? '') : '';

  const [sourceKey, setSourceKey] = useState('');
  const [mapName, setMapName] = useState(firstMap);
  const [model, setModel] = useState(firstModel);
  const [path, setPath] = useState('');
  const [sub, setSub] = useState('');

  const ref = sourceKey ? parseRef(sourceKey) : null;

  const pickSource = (key: string) => {
    setSourceKey(key);
    setPath('');
    setSub('');
    if (key) {
      try {
        const resolved = resolveRef(ws, parseRef(key));
        if (resolved) {
          const s = exposedSurface(resolved);
          setMapName(s.mapName);
          setModel(s.model);
          return;
        }
      } catch {
        /* fall through to raw */
      }
    }
    setMapName(firstMap);
    setModel(firstModel);
  };
  const pickMap = (m: string) => {
    setMapName(m);
    setModel(Object.keys(ws.maps[m]?.models ?? {})[0] ?? '');
    setPath('');
    setSub('');
  };

  const options = useMemo(() => {
    if (!mapName || !model || !ws.maps[mapName]?.models[model]) return [];
    try {
      const surface = ref
        ? resolveRef(ws, ref)
        : createLens({ maps: ws.maps, bridges: ws.bridges, mapName, model });
      if (!surface) return [];
      return lensValuePicker(surface, { mapName, model, maxDepth: 1 });
    } catch {
      return [];
    }
  }, [ws, ref, mapName, model]);

  const selected = options.find((o) => o.path === path);
  const composed = selected?.acceptsSubPath && sub ? `${selected.path}.${sub}` : selected?.path;

  if (Object.keys(ws.maps).length === 0) {
    return (
      <Panel title="Lens value picker">
        <Empty>Load fieldMaps first (Settings → Load sample).</Empty>
      </Panel>
    );
  }

  const models = Object.keys(ws.maps[mapName]?.models ?? {});
  const sourceOptions = [
    { value: '', label: '(none — raw maps)' },
    ...Object.keys(ws.lenses).map((n) => ({ value: `lens:${n}`, label: `lens · ${n}` })),
    ...Object.keys(ws.narrowings).map((n) => ({ value: `narrowing:${n}`, label: `narrowing · ${n}` })),
  ];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Lens value picker">
        <Row>
          <label style={{ fontSize: 13, color: tokens.textMuted }}>Surface:</label>
          <Select ariaLabel="surface" value={sourceKey} onChange={pickSource} options={sourceOptions} />
          <label style={{ fontSize: 13, color: tokens.textMuted }}>FieldMap:</label>
          <Select ariaLabel="fieldmap" value={mapName} onChange={pickMap} options={Object.keys(ws.maps).map((m) => ({ value: m, label: m }))} />
          <label style={{ fontSize: 13, color: tokens.textMuted }}>Model:</label>
          <Select
            ariaLabel="model"
            value={model}
            onChange={(m) => {
              setModel(m);
              setPath('');
              setSub('');
            }}
            options={models.map((m) => ({ value: m, label: m }))}
          />
        </Row>
        <Row>
          <label style={{ fontSize: 13, color: tokens.textMuted }}>Value path:</label>
          <Select
            ariaLabel="value path"
            value={path}
            placeholder="pick a path…"
            onChange={(v) => {
              setPath(v);
              setSub('');
            }}
            options={options.map((o) => ({
              value: o.path,
              label: `${o.path} · ${o.kind}${o.acceptsSubPath ? ' (json)' : ''}`,
            }))}
          />
          {selected?.acceptsSubPath && (
            <>
              <span style={{ color: tokens.textMuted }}>.</span>
              <input
                aria-label="json sub-path"
                placeholder="json.path"
                value={sub}
                onChange={(e) => setSub(e.target.value)}
                style={sel}
              />
            </>
          )}
        </Row>
        {selected && (
          <Row>
            <Badge tone="accent">path: {composed}</Badge>
            {selected.acceptsSubPath && <Badge tone="muted">JSON column → freeform sub-path</Badge>}
          </Row>
        )}
      </Panel>

      <Panel title="Operand (wire format)">
        <Code>{JSON.stringify(selected ? { path: composed, kind: selected.kind } : null, null, 2)}</Code>
      </Panel>
    </div>
  );
};
