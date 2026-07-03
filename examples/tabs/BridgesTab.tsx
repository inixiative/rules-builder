import {
  type Bridge,
  type BridgeCardinality,
  type FieldMap,
  stitchFieldMaps,
} from '@inixiative/json-rules';
import { useState } from 'react';
import { sampleBridges } from '../samples';
import { Badge, Button, Empty, Panel, Row, tokens } from '../ui';
import type { TabProps } from './types';

type Endpoint = { map: string; model: string; on: string };
const blank: Endpoint = { map: '', model: '', on: '' };

const Picker = ({
  label,
  maps,
  value,
  onChange,
}: {
  label: string;
  maps: Record<string, FieldMap>;
  value: Endpoint;
  onChange: (e: Endpoint) => void;
}) => {
  const models = value.map ? Object.keys(maps[value.map]?.models ?? {}) : [];
  const fields =
    value.map && value.model ? Object.keys(maps[value.map]?.models[value.model]?.fields ?? {}) : [];
  const sel = {
    padding: '5px 8px',
    borderRadius: 6,
    border: `1px solid ${tokens.borderStrong}`,
    fontSize: 13,
  };
  return (
    <Row>
      <strong style={{ fontSize: 12, minWidth: 64 }}>{label}</strong>
      <select
        style={sel}
        value={value.map}
        onChange={(e) => onChange({ map: e.target.value, model: '', on: '' })}
      >
        <option value="">map…</option>
        {Object.keys(maps).map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        style={sel}
        value={value.model}
        onChange={(e) => onChange({ ...value, model: e.target.value, on: '' })}
        disabled={!value.map}
      >
        <option value="">model…</option>
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        style={sel}
        value={value.on}
        onChange={(e) => onChange({ ...value, on: e.target.value })}
        disabled={!value.model}
      >
        <option value="">on field…</option>
        {fields.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
    </Row>
  );
};

export const BridgesTab = ({ ws, patch }: TabProps) => {
  const [a, setA] = useState<Endpoint>(blank);
  const [b, setB] = useState<Endpoint>(blank);
  const [card, setCard] = useState<BridgeCardinality>('oneToMany');
  const [error, setError] = useState<string | null>(null);

  const complete = (e: Endpoint) => e.map && e.model && e.on;

  const add = () => {
    if (!complete(a) || !complete(b)) {
      setError('Pick both endpoints (map, model, on field).');
      return;
    }
    const bridge: Bridge = {
      endpoints: [
        { fieldMap: a.map, model: a.model, on: a.on },
        { fieldMap: b.map, model: b.model, on: b.on },
      ],
      cardinality: card,
    };
    const next = [...ws.bridges, bridge];
    try {
      stitchFieldMaps({ maps: ws.maps, bridges: next });
      patch({ bridges: next });
      setError(null);
      setA(blank);
      setB(blank);
    } catch (err) {
      setError(String(err));
    }
  };

  const remove = (i: number) => patch({ bridges: ws.bridges.filter((_, idx) => idx !== i) });

  const describe = (br: Bridge) => {
    const [x, y] = br.endpoints;
    return `${x.fieldMap}:${x.model}.${x.on}  ↔  ${y.fieldMap}:${y.model}.${y.on}`;
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel
        title="Bridges"
        actions={
          <Button variant="ghost" onClick={() => patch({ bridges: sampleBridges })}>
            Load sample bridge
          </Button>
        }
      >
        {ws.bridges.length === 0 ? (
          <Empty>
            No bridges. A bridge injects a navigable “map:model” field on each endpoint model.
          </Empty>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {ws.bridges.map((br, i) => (
              <Row key={`${describe(br)}-${i}`} style={{ justifyContent: 'space-between' }}>
                <Row>
                  <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{describe(br)}</span>
                  <Badge tone="accent">{br.cardinality}</Badge>
                </Row>
                <Button variant="danger" onClick={() => remove(i)}>
                  Remove
                </Button>
              </Row>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Add a bridge"
        actions={
          <Button variant="primary" onClick={add}>
            Add bridge
          </Button>
        }
      >
        <Picker label="endpoint 0 (one)" maps={ws.maps} value={a} onChange={setA} />
        <Picker label="endpoint 1 (many)" maps={ws.maps} value={b} onChange={setB} />
        <Row>
          <strong style={{ fontSize: 12, minWidth: 64 }}>cardinality</strong>
          <select
            value={card}
            onChange={(e) => setCard(e.target.value as BridgeCardinality)}
            style={{
              padding: '5px 8px',
              borderRadius: 6,
              border: `1px solid ${tokens.borderStrong}`,
              fontSize: 13,
            }}
          >
            <option value="oneToMany">oneToMany</option>
            <option value="oneToOne">oneToOne</option>
          </select>
          <span style={{ fontSize: 12, color: tokens.textMuted }}>
            endpoint 0 is the “one” side (unique on field).
          </span>
        </Row>
        {error && <Badge tone="danger">{error}</Badge>}
      </Panel>
    </div>
  );
};
