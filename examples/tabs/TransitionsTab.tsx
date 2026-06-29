import { useEffect, useState } from 'react';
import { type MergeStrategy, type UseTransitionBuilder, useTransitionBuilder } from '../../src';
import { ActionRuleTree } from '../ActionRuleTree';
import { RuleTree } from '../RuleTree';
import { Badge, Button, Code, Empty, Panel, Row, Select, tokens } from '../ui';
import type { TabProps } from './types';

const box: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: 6,
  border: `1px solid ${tokens.borderStrong}`,
  fontSize: 13,
};
const subLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: tokens.textMuted,
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

const MERGE_OPTIONS = [
  { value: 'none', label: 'none' },
  { value: 'spread', label: 'spread ($set)' },
  { value: 'deepMerge', label: 'deepMerge ($merge)' },
  { value: 'append', label: 'append ($push)' },
  { value: 'appendUnique', label: 'appendUnique ($addToSet)' },
];
const mergeKind = (m: MergeStrategy | undefined): string => (m === undefined ? 'none' : typeof m === 'string' ? m : m.kind);
const mergePath = (m: MergeStrategy | undefined): string => (m && typeof m === 'object' ? m.path : '');

// Module-level so it isn't remounted each render (which would steal focus from the predicate inputs).
const SideEditor = ({
  tb,
  resource,
  action,
  index,
  side,
  label,
}: {
  tb: UseTransitionBuilder;
  resource: string;
  action: string;
  index: number;
  side: 'from' | 'to';
  label: string;
}) => {
  const predicate = tb.predicateRoot(resource, action, index, side);
  const hasPerm = tb.permissionHas(resource, action, index, side);
  const permission = tb.permissionRoot(resource, action, index, side);
  const merge = side === 'to' ? tb.mergeOf(resource, action, index) : undefined;
  const mkind = mergeKind(merge);

  return (
    <div
      style={{
        border: `1px solid ${tokens.border}`,
        borderLeft: `3px solid ${side === 'from' ? '#3b5bdb' : '#2b8a3e'}`,
        borderRadius: 8,
        padding: 10,
        display: 'grid',
        gap: 8,
        background: tokens.bg,
      }}
    >
      <strong style={{ fontSize: 12 }}>{label}</strong>

      <div style={{ display: 'grid', gap: 4 }}>
        <span style={subLabel}>predicate — is this state legal?</span>
        {predicate && <RuleTree root={predicate} />}
      </div>

      <div style={{ display: 'grid', gap: 4 }}>
        <Row>
          <span style={subLabel}>permission — authz on this side</span>
          {hasPerm ? (
            <Button variant="ghost" onClick={() => tb.clearPermission(resource, action, index, side)}>
              remove
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => tb.enablePermission(resource, action, index, side)}>
              + permission
            </Button>
          )}
        </Row>
        {permission && <ActionRuleTree root={permission} />}
      </div>

      {side === 'to' && (
        <Row>
          <span style={subLabel}>merge</span>
          <Select
            ariaLabel="merge"
            value={mkind}
            options={MERGE_OPTIONS}
            onChange={(k) => {
              if (k === 'none') tb.setMerge(resource, action, index, undefined);
              else if (k === 'spread' || k === 'deepMerge') tb.setMerge(resource, action, index, k as MergeStrategy);
              else tb.setMerge(resource, action, index, { kind: k as 'append' | 'appendUnique', path: mergePath(merge) });
            }}
          />
          {(mkind === 'append' || mkind === 'appendUnique') && (
            <input
              aria-label="merge path"
              placeholder="path"
              value={mergePath(merge)}
              style={box}
              onChange={(e) => tb.setMerge(resource, action, index, { kind: mkind as 'append' | 'appendUnique', path: e.target.value })}
            />
          )}
        </Row>
      )}
    </div>
  );
};

/** Transition schema editor: resource (`map:model`) → action → edges (from → to), each side a
 *  predicate (legality, via the rule builder) + optional permission (authz, via the ActionRule
 *  builder); `to` carries a serializable merge. */
export const TransitionsTab = ({ ws, patch, selected }: TabProps & { selected?: string }) => {
  const permissionActions = Object.fromEntries(
    Object.entries(ws.permissions).map(([r, p]) => [r, Object.keys(p.actions)]),
  );
  const tb = useTransitionBuilder({
    value: ws.transitions,
    onChange: (transitions) => patch({ transitions }),
    maps: ws.maps,
    bridges: ws.bridges,
    permissionActions,
    maxDepth: ws.maxDepth,
  });

  const [resource, setResource] = useState(selected ?? tb.resources[0] ?? '');
  const [action, setAction] = useState('');
  const [addResKey, setAddResKey] = useState('');
  const [newAction, setNewAction] = useState('');

  // biome-ignore lint/correctness/useExhaustiveDependencies: react only to the sidebar selection
  useEffect(() => {
    if (selected) {
      setResource(selected);
      setAction('');
    }
  }, [selected]);

  if (Object.keys(ws.maps).length === 0) {
    return (
      <Panel title="Transitions">
        <Empty>Add a fieldMap first — a transition gates a model's lifecycle.</Empty>
      </Panel>
    );
  }

  const available: string[] = [];
  for (const [mapName, m] of Object.entries(ws.maps)) {
    for (const model of Object.keys(m.models)) {
      const r = `${mapName}:${model}`;
      if (!tb.value[r]) available.push(r);
    }
  }

  const actions = resource ? tb.actionsOf(resource) : [];
  const pathCount = resource && action ? tb.pathCount(resource, action) : 0;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Resources (transition map)">
        <Row>
          {tb.resources.length === 0 && <Empty>No lifecycles yet — add a resource below.</Empty>}
          {tb.resources.map((r) => (
            <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <Button
                variant={r === resource ? 'primary' : 'default'}
                onClick={() => {
                  setResource(r);
                  setAction('');
                }}
              >
                {r}
              </Button>
              {removeBtn(r, () => {
                tb.removeResource(r);
                if (resource === r) {
                  setResource('');
                  setAction('');
                }
              })}
            </span>
          ))}
        </Row>
        <Row>
          <Select
            ariaLabel="add resource"
            value={addResKey}
            placeholder="add resource…"
            onChange={setAddResKey}
            options={available.map((r) => ({ value: r, label: r }))}
          />
          <Button
            variant="primary"
            disabled={!addResKey}
            onClick={() => {
              tb.addResource(addResKey);
              setResource(addResKey);
              setAction('');
              setAddResKey('');
            }}
          >
            Add resource
          </Button>
        </Row>
      </Panel>

      {resource && (
        <Panel title={`Actions on ${resource}`}>
          <Row>
            {actions.length === 0 && <Empty>No actions yet — add one (e.g. capturePayment, ship, cancel).</Empty>}
            {actions.map((a) => (
              <span key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <Button variant={a === action ? 'primary' : 'default'} onClick={() => setAction(a)}>
                  {a}
                </Button>
                {removeBtn(a, () => {
                  tb.removeAction(resource, a);
                  if (action === a) setAction('');
                })}
              </span>
            ))}
          </Row>
          <Row>
            <input value={newAction} onChange={(e) => setNewAction(e.target.value)} placeholder="action name (open)" style={{ ...box, flex: 1 }} />
            <Button
              variant="primary"
              disabled={!newAction.trim()}
              onClick={() => {
                const a = newAction.trim();
                tb.addAction(resource, a);
                setAction(a);
                setNewAction('');
              }}
            >
              Add action
            </Button>
          </Row>
        </Panel>
      )}

      {resource && action && (
        <Panel
          title={`${resource}.${action} — edges`}
          actions={
            <Button variant="primary" onClick={() => tb.addPath(resource, action)}>
              + path
            </Button>
          }
        >
          {Array.from({ length: pathCount }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: paths are positional + count-stable
            <div key={i} style={{ display: 'grid', gap: 8, border: `1px dashed ${tokens.borderStrong}`, borderRadius: 8, padding: 10 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Badge tone="accent">edge {i + 1}</Badge>
                {pathCount > 1 && (
                  <Button variant="danger" onClick={() => tb.removePath(resource, action, i)}>
                    remove edge
                  </Button>
                )}
              </Row>
              <SideEditor tb={tb} resource={resource} action={action} index={i} side="from" label="from (current record)" />
              <div style={{ textAlign: 'center', color: tokens.textMuted }}>↓</div>
              <SideEditor tb={tb} resource={resource} action={action} index={i} side="to" label="to (resulting record)" />
            </div>
          ))}
        </Panel>
      )}

      <Panel title="TransitionMap (JSON)">
        <Empty>The whole serializable transition schema — resource → action → {'{ paths: [{ from, to }] }'}.</Empty>
        <Code>{JSON.stringify(tb.value, null, 2)}</Code>
      </Panel>
    </div>
  );
};
