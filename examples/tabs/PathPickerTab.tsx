import { createLens } from '@inixiative/json-rules';
import { useMemo, useState } from 'react';
import { lensValuePicker } from '../../src/schema/lensValuePicker';
import { Badge, Code, Empty, Panel, Row, tokens } from '../ui';
import type { TabProps } from './types';

const sel: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: 6,
  border: `1px solid ${tokens.borderStrong}`,
  fontSize: 13,
};

/**
 * The lens value picker (`lensValuePicker`) — the shared atom behind a rule's `field`
 * (LHS) and `path` (RHS reference). Pick any value reachable through the lens; a `Json`
 * column is flagged `acceptsSubPath`, so this renderer offers a freeform sub-path input
 * (`metadata` → `metadata.theme`). The composed dotted path is a valid operand the
 * kernel resolves in `check`/`toPrisma`/`toSql`.
 */
export const PathPickerTab = ({ ws }: TabProps) => {
  const anchors = useMemo(() => {
    const list: { key: string; mapName: string; model: string }[] = [];
    for (const [mapName, map] of Object.entries(ws.maps))
      for (const model of Object.keys(map.models)) list.push({ key: `${mapName}.${model}`, mapName, model });
    return list;
  }, [ws.maps]);

  const [anchorKey, setAnchorKey] = useState('');
  const anchor = anchors.find((a) => a.key === anchorKey) ?? anchors[0];

  const options = useMemo(() => {
    if (!anchor) return [];
    const lens = createLens({ maps: ws.maps, bridges: ws.bridges, mapName: anchor.mapName, model: anchor.model });
    return lensValuePicker(lens, { maxDepth: 1 });
  }, [anchor, ws.maps, ws.bridges]);

  const [path, setPath] = useState('');
  const [sub, setSub] = useState('');
  const selected = options.find((o) => o.path === path);
  const composed = selected?.acceptsSubPath && sub ? `${selected.path}.${sub}` : selected?.path;

  if (!anchor) {
    return (
      <Panel title="Lens value picker">
        <Empty>Load fieldmaps first (tab 1).</Empty>
      </Panel>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Lens value picker">
        <Row>
          <label style={{ fontSize: 13, color: tokens.textMuted }}>Anchor:</label>
          <select
            value={anchor.key}
            onChange={(e) => {
              setAnchorKey(e.target.value);
              setPath('');
              setSub('');
            }}
            style={sel}
          >
            {anchors.map((a) => (
              <option key={a.key} value={a.key}>
                {a.key}
              </option>
            ))}
          </select>
        </Row>
        <Row>
          <label style={{ fontSize: 13, color: tokens.textMuted }}>Value path:</label>
          <select
            value={path}
            onChange={(e) => {
              setPath(e.target.value);
              setSub('');
            }}
            style={sel}
          >
            <option value="" disabled>
              pick a path…
            </option>
            {options.map((o) => (
              <option key={o.path} value={o.path}>
                {o.path} · {o.kind}
                {o.acceptsSubPath ? ' (json)' : ''}
              </option>
            ))}
          </select>
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
