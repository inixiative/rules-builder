import { type FieldMap, validateFieldMapSet } from '@inixiative/json-rules';
import { useEffect, useState } from 'react';
import { Badge, Button, Empty, Panel, Row, Select, tokens } from '../ui';
import type { TabProps } from './types';

const box: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: 6,
  border: `1px solid ${tokens.borderStrong}`,
  fontSize: 13,
};

const MapView = ({ name, map }: { name: string; map: FieldMap }) => (
  <div style={{ border: `1px solid ${tokens.border}`, borderRadius: 6, padding: 12, display: 'grid', gap: 10 }}>
    <Row style={{ justifyContent: 'space-between' }}>
      <strong style={{ fontSize: 13 }}>{name}</strong>
      <Badge>{Object.keys(map.models).length} models</Badge>
    </Row>
    {Object.entries(map.models).map(([modelName, model]) => (
      <div key={modelName} style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: tokens.textMuted }}>{modelName}</div>
        {Object.entries(model.fields).map(([fieldName, e]) => (
          <Row key={fieldName} style={{ fontSize: 12 }}>
            <span style={{ fontFamily: 'monospace', minWidth: 110 }}>{fieldName}</span>
            <span style={{ color: tokens.textMuted }}>
              {e.kind}:{e.type}
            </span>
            {e.isList && <Badge>list</Badge>}
            {(e.kind === 'object' || e.kind === 'bridge') && <Badge tone="accent">relation</Badge>}
            {e.values && <Badge tone="ok">{e.values.length} values</Badge>}
          </Row>
        ))}
      </div>
    ))}
    {map.enums && Object.keys(map.enums).length > 0 && (
      <div style={{ fontSize: 12 }}>
        <div style={{ fontWeight: 600, color: tokens.textMuted, marginBottom: 4 }}>enums</div>
        {Object.entries(map.enums).map(([enumName, values]) => (
          <div key={enumName} style={{ fontFamily: 'monospace' }}>
            {enumName}: [{values.join(', ')}]
          </div>
        ))}
      </div>
    )}
  </div>
);

export const FieldmapsTab = ({ ws, patch, selected }: TabProps & { selected?: string }) => {
  const mapNames = Object.keys(ws.maps);
  const [editing, setEditing] = useState<string>(selected ?? mapNames[0] ?? '');
  const [draft, setDraft] = useState('');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const open = (name: string) => {
    setEditing(name);
    setDraft(ws.maps[name] ? JSON.stringify(ws.maps[name], null, 2) : '');
    setError(null);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: open the map the sidebar selected
  useEffect(() => {
    if (selected && ws.maps[selected]) open(selected);
  }, [selected]);

  const save = () => {
    if (!editing) return;
    try {
      const parsed = JSON.parse(draft) as FieldMap;
      const maps = { ...ws.maps, [editing]: parsed };
      validateFieldMapSet({ maps });
      patch({ maps });
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const addMap = () => {
    const name = newName.trim();
    if (!name || ws.maps[name]) return;
    const empty: FieldMap = { models: {} };
    patch({ maps: { ...ws.maps, [name]: empty } });
    setNewName('');
    open(name);
    setDraft(JSON.stringify(empty, null, 2));
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel
        title="FieldMaps"
        actions={
          <Row>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="new map name" style={box} />
            <Button variant="primary" disabled={!newName.trim() || !!ws.maps[newName.trim()]} onClick={addMap}>
              Add fieldMap
            </Button>
          </Row>
        }
      >
        {mapNames.length === 0 ? (
          <Empty>No fieldMaps. Add one above, or import JSON from Settings.</Empty>
        ) : (
          <Row>
            <span style={{ fontSize: 13, color: tokens.textMuted }}>Edit:</span>
            <Select ariaLabel="edit map" value={editing} onChange={open} options={mapNames.map((n) => ({ value: n, label: n }))} />
          </Row>
        )}
      </Panel>

      {editing && ws.maps[editing] && (
        <Panel title={`Edit ${editing}`} actions={<Button variant="primary" onClick={save}>Save</Button>}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            style={{
              width: '100%',
              minHeight: 220,
              fontFamily: 'monospace',
              fontSize: 12,
              padding: 10,
              borderRadius: 6,
              border: `1px solid ${tokens.borderStrong}`,
              resize: 'vertical',
            }}
          />
          {error && <Badge tone="danger">{error}</Badge>}
          <MapView name={editing} map={ws.maps[editing]} />
        </Panel>
      )}
    </div>
  );
};
