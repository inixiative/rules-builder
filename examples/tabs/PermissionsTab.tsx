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

/** The rebac SCHEMA editor: the whole `model → { actions }` object across every model. A permission
 *  gates the raw record, so each model's editing surface is the full fieldMap model (relations via
 *  bridges) — built inside usePermissionBuilder from the maps. */
export const PermissionsTab = ({ ws, patch, selected }: TabProps & { selected?: string }) => {
  const pb = usePermissionBuilder({
    value: ws.permissions,
    onChange: (permissions) => patch({ permissions }),
    maps: ws.maps,
    bridges: ws.bridges,
    maxDepth: ws.maxDepth,
  });

  const [selectedModel, setSelectedModel] = useState(selected ?? pb.models[0] ?? '');
  const [selectedAction, setSelectedAction] = useState('');
  const [addModelKey, setAddModelKey] = useState('');
  const [newAction, setNewAction] = useState('');

  // biome-ignore lint/correctness/useExhaustiveDependencies: react only to the sidebar selection
  useEffect(() => {
    if (selected) {
      setSelectedModel(selected);
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
      if (!pb.value[model]) available.push({ key: model, label: `${mapName}.${model}` });
    }
  }

  const actions = selectedModel ? pb.actionsOf(selectedModel) : [];
  const root = selectedModel && selectedAction ? pb.actionRoot(selectedModel, selectedAction) : null;

  const addModel = () => {
    if (!addModelKey) return;
    pb.addModel(addModelKey);
    setSelectedModel(addModelKey);
    setSelectedAction('');
    setAddModelKey('');
  };
  const addAction = () => {
    const a = newAction.trim();
    if (!a || !selectedModel) return;
    pb.addAction(selectedModel, a);
    setSelectedAction(a);
    setNewAction('');
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Models (rebac schema)">
        <Row>
          {pb.models.length === 0 && <Empty>No models governed yet — add one below.</Empty>}
          {pb.models.map((m) => (
            <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <Button
                variant={m === selectedModel ? 'primary' : 'default'}
                onClick={() => {
                  setSelectedModel(m);
                  setSelectedAction('');
                }}
              >
                {m}
              </Button>
              {removeBtn(m, () => {
                pb.removeModel(m);
                if (selectedModel === m) {
                  setSelectedModel('');
                  setSelectedAction('');
                }
              })}
            </span>
          ))}
        </Row>
        <Row>
          <Select
            ariaLabel="add model"
            value={addModelKey}
            placeholder="add model…"
            onChange={setAddModelKey}
            options={available.map((a) => ({ value: a.key, label: a.label }))}
          />
          <Button variant="primary" disabled={!addModelKey} onClick={addModel}>
            Add model
          </Button>
        </Row>
      </Panel>

      {selectedModel && (
        <Panel title={`Actions on ${selectedModel}`}>
          <Row>
            {actions.length === 0 && <Empty>No actions yet — add one (e.g. read, manage, own).</Empty>}
            {actions.map((a) => (
              <span key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <Button variant={a === selectedAction ? 'primary' : 'default'} onClick={() => setSelectedAction(a)}>
                  {a}
                </Button>
                {removeBtn(a, () => {
                  pb.removeAction(selectedModel, a);
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
        <Panel title={`${selectedModel}.${selectedAction}`}>
          <ActionRuleTree root={root} />
        </Panel>
      )}

      <Panel title="rebac schema (JSON)">
        <Empty>The whole serializable schema — model → {'{ actions: name → ActionRule }'}.</Empty>
        <Code>{JSON.stringify(pb.value, null, 2)}</Code>
      </Panel>
    </div>
  );
};
