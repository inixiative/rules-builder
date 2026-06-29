import { exposedSurface } from '@inixiative/json-rules';
import { useEffect, useMemo, useState } from 'react';
import { type RebacSchema, type RuleBuilderSource, type SourceValues, runSources, usePermissionBuilder } from '../../src';
import { ActionRuleTree } from '../ActionRuleTree';
import { sampleRows } from '../samples';
import { Badge, Button, Code, Empty, Panel, Row, Select, tokens } from '../ui';
import { type ParentRef, resolveRef, type Workspace } from '../workspace';
import type { TabProps } from './types';

const box: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: 6,
  border: `1px solid ${tokens.borderStrong}`,
  fontSize: 13,
};

const refKey = (r: ParentRef) => `${r.kind}:${r.name}`;

const PermissionEditor = ({
  source,
  sourceValues,
  schema,
  onChange,
  maxDepth,
}: {
  source: RuleBuilderSource;
  sourceValues: SourceValues[];
  schema: RebacSchema;
  onChange: (s: RebacSchema) => void;
  maxDepth: number;
}) => {
  const pb = usePermissionBuilder({ value: schema, onChange, source, sourceValues, maxDepth });
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

/** The rebac schema editor: pick an entity (lens/narrowing) → its model, define named
 *  actions on it via the headless usePermissionBuilder (model-aware delegate/rel/self + abac). */
export const PermissionsTab = ({ ws, patch, selected }: TabProps & { selected?: string }) => {
  const choices = useMemo(
    () => [
      ...Object.keys(ws.lenses).map((n) => ({ key: `lens:${n}`, label: `lens · ${n}`, ref: { kind: 'lens' as const, name: n } })),
      ...Object.keys(ws.narrowings).map((n) => ({
        key: `narrowing:${n}`,
        label: `narrowing · ${n}`,
        ref: { kind: 'narrowing' as const, name: n },
      })),
    ],
    [ws.lenses, ws.narrowings],
  );

  const [entityKey, setEntityKey] = useState(choices[0]?.key ?? '');

  // biome-ignore lint/correctness/useExhaustiveDependencies: react only to the sidebar selection
  useEffect(() => {
    if (selected && ws.permissions[selected]) setEntityKey(refKey(ws.permissions[selected].source));
  }, [selected]);

  const choice = choices.find((c) => c.key === entityKey) ?? choices[0];

  const analysis = useMemo(() => {
    if (!choice) return null;
    try {
      const resolved = resolveRef(ws, choice.ref);
      if (!resolved) return null;
      const surface = exposedSurface(resolved);
      const source: RuleBuilderSource = { maps: surface.maps, mapName: surface.mapName, model: surface.model };
      return { model: surface.model, source, sourceValues: runSources(resolved, sampleRows) };
    } catch {
      return null;
    }
  }, [ws, choice]);

  if (!choice) {
    return (
      <Panel title="Permissions">
        <Empty>Create a lens or narrowing first — a permission is authored against one.</Empty>
      </Panel>
    );
  }
  if (!analysis) {
    return (
      <Panel title="Permissions">
        <Badge tone="danger">entity not resolvable</Badge>
      </Panel>
    );
  }

  const { model, source, sourceValues } = analysis;
  const schema: RebacSchema = Object.fromEntries(
    Object.entries(ws.permissions).map(([m, p]) => [m, { actions: p.actions }]),
  );
  const onSchemaChange = (next: RebacSchema) => {
    const permissions: Workspace['permissions'] = {};
    for (const [m, mp] of Object.entries(next)) {
      // The model being edited re-binds to the selected entrypoint; others keep their source.
      permissions[m] = { source: m === model ? choice.ref : (ws.permissions[m]?.source ?? choice.ref), actions: mp.actions };
    }
    patch({ permissions });
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Entrypoint">
        <Row>
          <label style={{ fontSize: 13, color: tokens.textMuted }}>Lens / narrowing:</label>
          <Select
            ariaLabel="entrypoint"
            value={choice.key}
            onChange={setEntityKey}
            options={choices.map((c) => ({ value: c.key, label: c.label }))}
          />
          <Badge tone="accent">model {model}</Badge>
          <span style={{ fontSize: 12, color: tokens.textMuted }}>the surface the rules are authored against</span>
        </Row>
      </Panel>

      <PermissionEditor
        key={model}
        source={source}
        sourceValues={sourceValues}
        schema={schema}
        onChange={onSchemaChange}
        maxDepth={ws.maxDepth}
      />
    </div>
  );
};
