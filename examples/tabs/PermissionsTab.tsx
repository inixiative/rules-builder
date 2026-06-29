import { useEffect, useState } from 'react';
import { usePermissionBuilder } from '../../src';
import { ActionRuleTree } from '../ActionRuleTree';
import { Button, Code, Empty, Panel, Row, Select, tokens } from '../ui';
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
export const PermissionsTab = ({ ws, patch, selected }: TabProps & { selected?: string }) => {
  const pb = usePermissionBuilder({
    value: { bridges: ws.bridges, permissions: ws.permissions },
    onChange: (schema) => patch({ permissions: schema.permissions }),
    maps: ws.maps,
    bridges: ws.bridges,
    maxDepth: ws.maxDepth,
  });

  const [selectedResource, setSelectedResource] = useState(selected ?? pb.resources[0] ?? '');
  const [selectedAction, setSelectedAction] = useState('');
  const [addResourceKey, setAddResourceKey] = useState('');
  const [newAction, setNewAction] = useState('');

  // biome-ignore lint/correctness/useExhaustiveDependencies: react only to the sidebar selection
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
  for (const [mapName, m] of Object.entries(ws.maps)) {
    for (const model of Object.keys(m.models)) {
      const resource = `${mapName}:${model}`;
      if (!pb.value.permissions[resource]) available.push({ key: resource, label: resource });
    }
  }

  const actions = selectedResource ? pb.actionsOf(selectedResource) : [];
  const root = selectedResource && selectedAction ? pb.actionRoot(selectedResource, selectedAction) : null;

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
            {actions.length === 0 && <Empty>No actions yet — add one (e.g. read, manage, own).</Empty>}
            {actions.map((a) => (
              <span key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <Button variant={a === selectedAction ? 'primary' : 'default'} onClick={() => setSelectedAction(a)}>
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
        <Empty>The whole serializable schema — {'{ bridges, permissions: resource → { actions } }'}.</Empty>
        <Code>{JSON.stringify(pb.value, null, 2)}</Code>
      </Panel>
    </div>
  );
};
