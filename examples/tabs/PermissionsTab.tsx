import { useEffect, useMemo, useState } from 'react';
import { type RebacSchema, type RuleBuilderSource, usePermissionBuilder } from '../../src';
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

const PermissionEditor = ({
  source,
  schema,
  onChange,
  maxDepth,
}: {
  source: RuleBuilderSource;
  schema: RebacSchema;
  onChange: (s: RebacSchema) => void;
  maxDepth: number;
}) => {
  const pb = usePermissionBuilder({ value: schema, onChange, source, maxDepth });
  const [selectedAction, setSelectedAction] = useState('');
  const [newAction, setNewAction] = useState('');

  const add = () => {
    const n = newAction.trim();
    if (!n || pb.actions.includes(n)) return;
    pb.addAction(n);
    setSelectedAction(n);
    setNewAction('');
  };
  const remove = (a: string) => {
    pb.removeAction(a);
    if (selectedAction === a) setSelectedAction('');
  };

  const root = selectedAction ? pb.actionRoot(selectedAction) : null;

  return (
    <>
      <Panel
        title={`Actions on ${pb.model}`}
        actions={
          pb.actions.length > 0 ? (
            <Button
              variant="danger"
              onClick={() => {
                pb.removeModel();
                setSelectedAction('');
              }}
            >
              Remove model
            </Button>
          ) : undefined
        }
      >
        <Row>
          {pb.actions.length === 0 && <Empty>No actions yet — add one (e.g. read, manage, own).</Empty>}
          {pb.actions.map((a) => (
            <span key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <Button variant={a === selectedAction ? 'primary' : 'default'} onClick={() => setSelectedAction(a)}>
                {a}
              </Button>
              <button
                type="button"
                aria-label={`remove ${a}`}
                onClick={() => remove(a)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: tokens.textMuted }}
              >
                ✕
              </button>
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
          <Button variant="primary" disabled={!newAction.trim() || pb.actions.includes(newAction.trim())} onClick={add}>
            Add action
          </Button>
        </Row>
      </Panel>

      {root && (
        <Panel title={`${pb.model}.${selectedAction}`}>
          <ActionRuleTree root={root} />
        </Panel>
      )}

      <Panel title="Permission (rebac JSON)">
        <Empty>The serializable ModelPermission for {pb.model} — a rebac schema entry.</Empty>
        <Code>{JSON.stringify({ [pb.model]: schema[pb.model] ?? { actions: {} } }, null, 2)}</Code>
      </Panel>
    </>
  );
};

/** The rebac schema editor: pick a RAW model (the resource record — full surface, no narrowing),
 *  then define named actions on it via usePermissionBuilder (model-aware delegate/rel/self + abac). */
export const PermissionsTab = ({ ws, patch, selected }: TabProps & { selected?: string }) => {
  const modelChoices = useMemo(() => {
    const out: { key: string; mapName: string; model: string }[] = [];
    for (const [mapName, m] of Object.entries(ws.maps)) {
      for (const model of Object.keys(m.models)) out.push({ key: `${mapName}.${model}`, mapName, model });
    }
    return out;
  }, [ws.maps]);

  const [modelKey, setModelKey] = useState(modelChoices[0]?.key ?? '');

  // biome-ignore lint/correctness/useExhaustiveDependencies: react only to the sidebar selection
  useEffect(() => {
    const src = selected ? ws.permissions[selected]?.source : undefined;
    if (src) setModelKey(`${src.mapName}.${src.model}`);
  }, [selected]);

  const choice = modelChoices.find((c) => c.key === modelKey) ?? modelChoices[0];

  const source = useMemo<RuleBuilderSource | null>(
    () => (choice ? { maps: ws.maps, bridges: ws.bridges, mapName: choice.mapName, model: choice.model } : null),
    [ws.maps, ws.bridges, choice],
  );

  if (!choice || !source) {
    return (
      <Panel title="Permissions">
        <Empty>Add a fieldMap first — a permission gates a model's records.</Empty>
      </Panel>
    );
  }

  const model = choice.model;
  const schema: RebacSchema = Object.fromEntries(
    Object.entries(ws.permissions).map(([m, p]) => [m, { actions: p.actions }]),
  );
  const onSchemaChange = (next: RebacSchema) => {
    const permissions: Workspace['permissions'] = {};
    for (const [m, mp] of Object.entries(next)) {
      permissions[m] = {
        source: m === model ? { mapName: choice.mapName, model } : (ws.permissions[m]?.source ?? { mapName: choice.mapName, model: m }),
        actions: mp.actions,
      };
    }
    patch({ permissions });
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Resource model">
        <Row>
          <label style={{ fontSize: 13, color: tokens.textMuted }}>Model:</label>
          <Select
            ariaLabel="model"
            value={choice.key}
            onChange={setModelKey}
            options={modelChoices.map((c) => ({ value: c.key, label: `${c.mapName}.${c.model}` }))}
          />
          <span style={{ fontSize: 12, color: tokens.textMuted }}>the raw record the rules gate — full fields + relations</span>
        </Row>
      </Panel>

      <PermissionEditor key={model} source={source} schema={schema} onChange={onSchemaChange} maxDepth={ws.maxDepth} />
    </div>
  );
};
