import { type FieldMap, validateFieldMapSet } from '@inixiative/json-rules';
import { useState } from 'react';
import { sampleMaps } from '../samples';
import { Badge, Button, Empty, Panel, Row, tokens } from '../ui';
import type { TabProps } from './types';

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

export const FieldmapsTab = ({ ws, patch }: TabProps) => {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadJson = () => {
    try {
      const parsed = JSON.parse(draft) as Record<string, FieldMap>;
      validateFieldMapSet({ maps: parsed });
      patch({ maps: parsed });
      setError(null);
      setDraft('');
    } catch (err) {
      setError(String(err));
    }
  };

  const mapNames = Object.keys(ws.maps);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel
        title="Loaded fieldmaps"
        actions={<Button variant="primary" onClick={() => patch({ maps: sampleMaps })}>Load app + crm samples</Button>}
      >
        {mapNames.length === 0 ? (
          <Empty>No fieldmaps loaded. Load the samples or paste JSON below.</Empty>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {mapNames.map((name) => (
              <MapView key={name} name={name} map={ws.maps[name]} />
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Import fieldmaps from JSON"
        actions={
          <Button onClick={loadJson} disabled={!draft.trim()}>
            Load maps
          </Button>
        }
      >
        <Empty>
          Paste a <code>{'{ mapName: FieldMap }'}</code> object. Validated with <code>validateFieldMapSet</code>.
        </Empty>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder='{ "app": { "models": { "User": { "fields": { "email": { "kind": "scalar", "type": "String" } } } } } }'
          spellCheck={false}
          style={{
            width: '100%',
            minHeight: 120,
            fontFamily: 'monospace',
            fontSize: 12,
            padding: 10,
            borderRadius: 6,
            border: `1px solid ${tokens.borderStrong}`,
            resize: 'vertical',
          }}
        />
        {error && <Badge tone="danger">{error}</Badge>}
      </Panel>
    </div>
  );
};
