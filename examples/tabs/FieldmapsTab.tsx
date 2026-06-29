import { type FieldMap, validateFieldMapSet } from '@inixiative/json-rules';
import { useEffect, useState } from 'react';
import { Badge, EditorHeader, Panel, Row, tokens } from '../ui';
import type { TabProps } from './types';

const EMPTY_MAP = JSON.stringify({ models: {} }, null, 2);

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
      <Badge>{Object.keys(map.models ?? {}).length} models</Badge>
    </Row>
    {Object.entries(map.models ?? {}).map(([modelName, model]) => (
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

/** A fieldMap = a name + its JSON. Single form (like Lens/Narrowing): the name field is
 *  the identity — Save creates a new map or updates/renames the selected one. */
export const FieldmapsTab = ({ ws, patch, selected }: TabProps & { selected?: string }) => {
  const [name, setName] = useState(selected ?? '');
  const [draft, setDraft] = useState(selected && ws.maps[selected] ? JSON.stringify(ws.maps[selected], null, 2) : EMPTY_MAP);
  const [error, setError] = useState<string | null>(null);

  // The sidebar drives it: a map item loads it; the section header (no item) → a fresh map.
  // biome-ignore lint/correctness/useExhaustiveDependencies: react only to the selection
  useEffect(() => {
    if (selected && ws.maps[selected]) {
      setName(selected);
      setDraft(JSON.stringify(ws.maps[selected], null, 2));
    } else if (!selected) {
      setName('');
      setDraft(EMPTY_MAP);
    }
    setError(null);
  }, [selected]);

  const save = () => {
    const newName = name.trim();
    if (!newName) return;
    try {
      const parsed = JSON.parse(draft) as FieldMap;
      const maps = { ...ws.maps };
      if (selected && selected !== newName) delete maps[selected]; // rename
      maps[newName] = parsed;
      validateFieldMapSet({ maps });
      patch({ maps });
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  let preview: FieldMap | null = null;
  try {
    preview = JSON.parse(draft) as FieldMap;
  } catch {
    preview = null;
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <EditorHeader
        title="FieldMap"
        name={name}
        onName={setName}
        namePlaceholder="map name (e.g. app)"
        saveDisabled={!name.trim()}
        onSave={save}
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
        {preview && <MapView name={name || '(unnamed)'} map={preview} />}
      </Panel>
    </div>
  );
};
