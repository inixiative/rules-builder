import { useEffect, useState } from 'react';
import { usePermissionBuilder } from '../../src';
import { ActionRuleTree } from '../ActionRuleTree';
import { Button, Code, Empty, Panel, Row, Select, tokens } from '../ui';
import type { Workspace } from '../workspace';
import type { TabProps } from './types';

const box: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: 6,
  border: `1px solid ${tokens.borderStrong}`,
  fontSize: 13,
};

const removeBtn = (label: string, onClick: () => void) => (
  <button
    type="button"
    aria-label={`remove ${label}`}
    onClick={onClick}
    style={{ border: 'none', background: 'none', cursor: 'pointer', color: tokens.textMuted }}
  >
    ✕
  </button>
);

/** The rebac SCHEMA editor: the whole `{ bridges, permissions }` object. Resources are map-qualified
 *  (`app:User`); a permission gates the RAW record, so each resource's editing surface is the full
 *  fieldMap model (relations via bridges) — built inside usePermissionBuilder from the maps. */
const bridgeKey = (b: Workspace['bridges'][number]) =>
  `${b.endpoints[0].fieldMap}:${b.endpoints[0].model} ↔ ${b.endpoints[1].fieldMap}:${b.endpoints[1].model}`;
const toggle = (s: Set<string>, k: string): Set<string> => {
  const n = new Set(s);
  if (n.has(k)) n.delete(k);
  else n.add(k);
  return n;
};

export const PermissionsTab = ({ ws, patch, selected }: TabProps & { selected?: string }) => {
  // Scope: which fieldMaps bound the resource picker, and which bridges the schema includes.
  const [excludedMaps, setExcludedMaps] = useState<Set<string>>(new Set());
  const [excludedBridges, setExcludedBridges] = useState<Set<string>>(new Set());
  const mapsInScope = Object.keys(ws.maps).filter((m) => !excludedMaps.has(m));
  const includedBridges = ws.bridges.filter((b) => !excludedBridges.has(bridgeKey(b)));

  const pb = usePermissionBuilder({
    value: { bridges: includedBridges, permissions: ws.permissions },
    onChange: (schema) => patch({ permissions: schema.permissions }),
    maps: ws.maps,
    bridges: includedBridges,
    maxDepth: ws.maxDepth,
  });

  const [selectedResource, setSelectedResource] = useState(selected ?? pb.resources[0] ?? '');
  const [selectedAction, setSelectedAction] = useState('');
  const [addResourceKey, setAddResourceKey] = useState('');
  const [newAction, setNewAction] = useState('');

  useEffect(() => {
    if (selected) {
      setSelectedResource(selected);
      setSelectedAction('');
    }
  }, [selected]);

  if (Object.keys(ws.maps).length === 0) {
    return (
      <Panel title="Permissions">
        <Empty>Add a fieldMap first — a permission gates a model's records.</Empty>
      </Panel>
    );
  }

  const available: { key: string; label: string }[] = [];
  for (const mapName of mapsInScope) {
    for (const model of Object.keys(ws.maps[mapName]?.models ?? {})) {
      const resource = `${mapName}:${model}`;
      if (!pb.value.permissions[resource]) available.push({ key: resource, label: resource });
    }
  }

  const actions = selectedResource ? pb.actionsOf(selectedResource) : [];
  const root =
    selectedResource && selectedAction ? pb.actionRoot(selectedResource, selectedAction) : null;

  const addResource = () => {
    if (!addResourceKey) return;
    pb.addResource(addResourceKey);
    setSelectedResource(addResourceKey);
    setSelectedAction('');
    setAddResourceKey('');
  };
  const addAction = () => {
    const a = newAction.trim();
    if (!a || !selectedResource) return;
    pb.addAction(selectedResource, a);
    setSelectedAction(a);
    setNewAction('');
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="FieldMaps & bridges (scope)">
        <Row>
          <span style={{ fontSize: 13, color: tokens.textMuted }}>FieldMaps:</span>
          {Object.keys(ws.maps).map((m) => (
            <label key={m} style={{ fontSize: 12, fontFamily: 'monospace' }}>
              <input
                type="checkbox"
                checked={!excludedMaps.has(m)}
                onChange={() => setExcludedMaps((s) => toggle(s, m))}
              />{' '}
              {m}
            </label>
          ))}
        </Row>
        {ws.bridges.length > 0 && (
          <Row>
            <span style={{ fontSize: 13, color: tokens.textMuted }}>Bridges:</span>
            {ws.bridges.map((b) => (
              <label key={bridgeKey(b)} style={{ fontSize: 12, fontFamily: 'monospace' }}>
                <input
                  type="checkbox"
                  checked={!excludedBridges.has(bridgeKey(b))}
                  onChange={() => setExcludedBridges((s) => toggle(s, bridgeKey(b)))}
                />{' '}
                {bridgeKey(b)}
              </label>
            ))}
          </Row>
        )}
        <Empty>
          FieldMaps bound which resources you can add; checked bridges become the schema's `bridges`
          (for rel walks).
        </Empty>
      </Panel>

      <Panel title="Resources (rebac schema)">
        <Row>
          {pb.resources.length === 0 && <Empty>No resources governed yet — add one below.</Empty>}
          {pb.resources.map((r) => (
            <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <Button
                variant={r === selectedResource ? 'primary' : 'default'}
                onClick={() => {
                  setSelectedResource(r);
                  setSelectedAction('');
                }}
              >
                {r}
              </Button>
              {removeBtn(r, () => {
                pb.removeResource(r);
                if (selectedResource === r) {
                  setSelectedResource('');
                  setSelectedAction('');
                }
              })}
            </span>
          ))}
        </Row>
        <Row>
          <Select
            ariaLabel="add resource"
            value={addResourceKey}
            placeholder="add resource…"
            onChange={setAddResourceKey}
            options={available.map((a) => ({ value: a.key, label: a.label }))}
          />
          <Button variant="primary" disabled={!addResourceKey} onClick={addResource}>
            Add resource
          </Button>
        </Row>
      </Panel>

      {selectedResource && (
        <Panel title={`Actions on ${selectedResource}`}>
          <Row>
            {actions.length === 0 && (
              <Empty>No actions yet — add one (e.g. read, manage, own).</Empty>
            )}
            {actions.map((a) => (
              <span key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <Button
                  variant={a === selectedAction ? 'primary' : 'default'}
                  onClick={() => setSelectedAction(a)}
                >
                  {a}
                </Button>
                {removeBtn(a, () => {
                  pb.removeAction(selectedResource, a);
                  if (selectedAction === a) setSelectedAction('');
                })}
              </span>
            ))}
          </Row>
          <Row>
            <input
              value={newAction}
              onChange={(e) => setNewAction(e.target.value)}
              placeholder="action name (open)"
              style={{ ...box, flex: 1 }}
            />
            <Button variant="primary" disabled={!newAction.trim()} onClick={addAction}>
              Add action
            </Button>
          </Row>
        </Panel>
      )}

      {root && (
        <Panel title={`${selectedResource}.${selectedAction}`}>
          <ActionRuleTree root={root} />
        </Panel>
      )}

      <Panel title="rebac schema (JSON)">
        <Empty>
          The whole serializable schema — {'{ bridges, permissions: resource → { actions } }'}.
        </Empty>
        <Code>{JSON.stringify(pb.value, null, 2)}</Code>
      </Panel>
    </div>
  );
};
