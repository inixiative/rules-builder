import { type FieldMap, validateFieldMapSet } from '@inixiative/json-rules';
import { useEffect, useState } from 'react';
import { Badge, EditorHeader, Empty, Panel, Row, tokens } from '../ui';
import type { TabProps } from './types';

const MapView = ({ name, map }: { name: string; map: FieldMap }) => (
  <div
    style={{
      border: `1px solid ${tokens.border}`,
      borderRadius: 6,
      padding: 12,
      display: 'grid',
      gap: 10,
    }}
  >
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
  const [editing, setEditing] = useState('');
  const [name, setName] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const open = (m: string) => {
    setEditing(m);
    setName(m);
    setDraft(ws.maps[m] ? JSON.stringify(ws.maps[m], null, 2) : '');
    setError(null);
  };
  const clear = () => {
    setEditing('');
    setName('');
    setDraft('');
    setError(null);
  };

  // The sidebar drives editing: a map item opens it; the section header (no item) clears it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: react only to the selection
  useEffect(() => {
    if (selected && ws.maps[selected]) open(selected);
    else if (!selected) clear();
  }, [selected]);

  const isEditing = !!editing && !!ws.maps[editing];

  const save = () => {
    try {
      const parsed = JSON.parse(draft) as FieldMap;
      const newName = name.trim() || editing;
      const maps = { ...ws.maps };
      if (newName !== editing) delete maps[editing];
      maps[newName] = parsed;
      validateFieldMapSet({ maps });
      patch({ maps });
      setEditing(newName);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const addMap = () => {
    const n = name.trim();
    if (!n || ws.maps[n]) return;
    const empty: FieldMap = { models: {} };
    patch({ maps: { ...ws.maps, [n]: empty } });
    open(n);
    setDraft(JSON.stringify(empty, null, 2));
  };

  if (isEditing) {
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <EditorHeader
          title="Edit fieldMap"
          name={name}
          onName={setName}
          namePlaceholder="map name"
          onSave={save}
          onClose={clear}
        />
        <Panel title="JSON">
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
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <EditorHeader
        title="New fieldMap"
        name={name}
        onName={setName}
        namePlaceholder="new map name"
        saveLabel="Add fieldMap"
        saveDisabled={!name.trim() || !!ws.maps[name.trim()]}
        onSave={addMap}
      />
      <Panel title="FieldMaps">
        {mapNames.length === 0 ? (
          <Empty>No fieldMaps yet. Add one above, or import JSON from Settings.</Empty>
        ) : (
          <Empty>Pick a fieldMap from the inventory on the left to edit it, or add a new one above.</Empty>
        )}
      </Panel>
    </div>
  );
};
