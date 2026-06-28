import { createLens } from '@inixiative/json-rules';
import { useMemo, useState } from 'react';
import { lensValuePicker } from '../../src/schema/lensValuePicker';
import { Badge, Code, Empty, Panel, Row, Select, tokens } from '../ui';
import type { TabProps } from './types';

const sel: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: 6,
  border: `1px solid ${tokens.borderStrong}`,
  fontSize: 13,
};

/**
 * The lens value picker (`lensValuePicker`) — the shared atom behind a rule's `field`
 * (LHS) and `path` (RHS reference). Pick a lens → fieldMap → model, then any value
 * reachable through it. The lens's narrowing + attached bridges scope what's offered;
 * a `Json` column is flagged `acceptsSubPath`, so a freeform sub-path input appears.
 */
export const PathPickerTab = ({ ws }: TabProps) => {
  const lensNames = Object.keys(ws.narrowings);
  const firstMap = Object.keys(ws.maps)[0] ?? '';
  const firstModel = firstMap ? (Object.keys(ws.maps[firstMap]?.models ?? {})[0] ?? '') : '';

  const [lensName, setLensName] = useState('');
  const [mapName, setMapName] = useState(firstMap);
  const [model, setModel] = useState(firstModel);
  const [path, setPath] = useState('');
  const [sub, setSub] = useState('');

  const lens = lensName ? ws.narrowings[lensName] : undefined;

  const pickLens = (name: string) => {
    const l = name ? ws.narrowings[name] : undefined;
    setLensName(name);
    setMapName(l?.mapName ?? firstMap);
    setModel(l?.model ?? firstModel);
    setPath('');
    setSub('');
  };
  const pickMap = (m: string) => {
    setMapName(m);
    setModel(Object.keys(ws.maps[m]?.models ?? {})[0] ?? '');
    setPath('');
    setSub('');
  };

  const options = useMemo(() => {
    if (!mapName || !model || !ws.maps[mapName]?.models[model]) return [];
    const bridges = lens?.bridges ?? ws.bridges;
    const base = createLens({ maps: ws.maps, bridges, mapName: lens?.mapName ?? mapName, model: lens?.model ?? model });
    const narrowed = lens?.narrowing ? { parent: base, ...lens.narrowing } : base;
    return lensValuePicker(narrowed, { mapName, model, maxDepth: 1 });
  }, [ws.maps, ws.bridges, lens, mapName, model]);

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

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Lens value picker">
        <Row>
          <label style={{ fontSize: 13, color: tokens.textMuted }}>Lens:</label>
          <Select
            ariaLabel="lens"
            value={lensName}
            onChange={pickLens}
            options={[{ value: '', label: '(none — raw maps)' }, ...lensNames.map((n) => ({ value: n, label: n }))]}
          />
          <label style={{ fontSize: 13, color: tokens.textMuted }}>FieldMap:</label>
          <Select
            ariaLabel="fieldmap"
            value={mapName}
            onChange={pickMap}
            options={Object.keys(ws.maps).map((m) => ({ value: m, label: m }))}
          />
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
