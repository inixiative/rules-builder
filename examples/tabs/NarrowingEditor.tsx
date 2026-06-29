import {
  exposedSurface,
  type Lens,
  type LensNarrowing,
  type ModelNarrowing,
  validateNarrowing,
} from '@inixiative/json-rules';
import { useEffect, useMemo, useState } from 'react';
import { runSources } from '../../src';
import { describeModelFields } from '../../src/schema/surface';
import { sampleRows } from '../samples';
import { Badge, Button, Code, EditorHeader, Empty, Panel, Row, Select, tokens } from '../ui';
import { narrowingAncestors, type ParentRef, resolveRef, type SavedNarrowing } from '../workspace';
import { NarrowingNode, type NodeCtx } from './NarrowingNode';
import type { TabProps } from './types';

const refValue = (r: ParentRef) => `${r.kind}:${r.name}`;
const parseRef = (v: string): ParentRef => {
  const i = v.indexOf(':');
  return { kind: v.slice(0, i) as 'lens' | 'narrowing', name: v.slice(i + 1) };
};

export const NarrowingEditor = ({ ws, patch, selected }: TabProps & { selected?: string }) => {
  const firstParent = (): ParentRef => {
    const lens = Object.keys(ws.lenses)[0];
    if (lens) return { kind: 'lens', name: lens };
    return { kind: 'narrowing', name: Object.keys(ws.narrowings)[0] ?? '' };
  };

  const [draft, setDraft] = useState<SavedNarrowing>(() => ({
    parent: firstParent(),
    narrowing: {},
  }));
  const [name, setName] = useState(selected ?? '');
  const [addMap, setAddMap] = useState('');
  const [addModel, setAddModel] = useState('');

  // biome-ignore lint/correctness/useExhaustiveDependencies: react only to the selection
  useEffect(() => {
    if (selected && ws.narrowings[selected]) {
      setDraft(ws.narrowings[selected]);
      setName(selected);
    } else if (!selected) {
      setDraft({ parent: firstParent(), narrowing: {} });
      setName('');
    }
  }, [selected]);

  const parentSurface = useMemo<Lens | null>(() => {
    try {
      const resolved = resolveRef(ws, draft.parent);
      return resolved ? exposedSurface(resolved) : null;
    } catch {
      return null;
    }
  }, [ws, draft.parent]);

  const resolvedChain = useMemo<Lens | LensNarrowing | null>(() => {
    const parent = resolveRef(ws, draft.parent);
    return parent ? ({ parent, ...draft.narrowing } as LensNarrowing) : null;
  }, [ws, draft]);

  const sourceValues = useMemo(() => {
    if (!resolvedChain) return [];
    try {
      return runSources(resolvedChain, sampleRows);
    } catch {
      return [];
    }
  }, [resolvedChain]);

  const analysis = useMemo(() => {
    if (!resolvedChain || !parentSurface)
      return {
        error: 'Parent not resolvable.',
        fields: [] as ReturnType<typeof describeModelFields>,
      };
    try {
      validateNarrowing(resolvedChain as LensNarrowing);
      const surface = exposedSurface(resolvedChain);
      return {
        error: null as string | null,
        fields: describeModelFields(surface, parentSurface.mapName, parentSurface.model),
      };
    } catch (e) {
      return {
        error: String(e),
        fields: [] as ReturnType<typeof describeModelFields>,
      };
    }
  }, [resolvedChain, parentSurface]);

  if (Object.keys(ws.lenses).length === 0 && Object.keys(ws.narrowings).length === 0) {
    return (
      <Panel title="Narrowing">
        <Empty>Create a lens first — a narrowing restricts a lens (or another narrowing).</Empty>
      </Panel>
    );
  }
  if (!parentSurface) {
    return (
      <Panel title="Narrowing">
        <Badge tone="danger">parent not resolvable</Badge>
      </Panel>
    );
  }

  const narrowing = draft.narrowing;
  const defaults = narrowing.mapDefaults ?? {};
  const ctx: NodeCtx = {
    maps: parentSurface.maps,
    bridges: [],
    sourceValues,
    maxDepth: ws.maxDepth,
  };

  const setRoot = (root: ModelNarrowing) => setDraft((d) => ({ ...d, narrowing: { ...d.narrowing, root } }));

  const setDefaultModel = (mp: string, md: string, node: ModelNarrowing | null) =>
    setDraft((d) => {
      const all = structuredClone(d.narrowing.mapDefaults ?? {});
      all[mp] = all[mp] ?? {};
      const models = { ...(all[mp].models ?? {}) };
      if (node === null) delete models[md];
      else models[md] = node;
      if (Object.keys(models).length) all[mp].models = models;
      else delete all[mp].models;
      if (!all[mp].models && !all[mp].enums) delete all[mp];
      const mapDefaults = Object.keys(all).length ? all : undefined;
      return { ...d, narrowing: { ...d.narrowing, mapDefaults } };
    });

  // A narrowing can parent off a lens or another narrowing — but never itself or one
  // of its own descendants (that would form a cycle).
  const parentOptions = [
    ...Object.keys(ws.lenses).map((n) => ({
      value: `lens:${n}`,
      label: `lens · ${n}`,
    })),
    ...Object.keys(ws.narrowings)
      .filter((n) => n !== name && !narrowingAncestors(ws, n).has(name))
      .map((n) => ({ value: `narrowing:${n}`, label: `narrowing · ${n}` })),
  ];
  const surfaceMaps = Object.keys(parentSurface.maps);
  const addModels = Object.keys(parentSurface.maps[addMap]?.models ?? {});

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <EditorHeader
        title="Narrowing"
        name={name}
        onName={setName}
        namePlaceholder="narrowing name (e.g. admins-only)"
        saveDisabled={!name.trim() || !!analysis.error}
        onSave={() => patch({ narrowings: { ...ws.narrowings, [name.trim()]: draft } })}
      />

      <Panel title="Parent">
        <Row>
          <label style={{ fontSize: 13, color: tokens.textMuted }}>Restrict:</label>
          <Select
            ariaLabel="parent"
            value={refValue(draft.parent)}
            onChange={(v) => setDraft((d) => ({ ...d, parent: parseRef(v) }))}
            options={parentOptions}
          />
          <span style={{ fontSize: 12, color: tokens.textMuted }}>
            anchor {parentSurface.mapName}.{parentSurface.model} — options are limited to what the parent exposes
          </span>
        </Row>
      </Panel>

      <Panel title="Root narrowing (path-specific)">
        <NarrowingNode
          ctx={ctx}
          mapName={parentSurface.mapName}
          model={parentSurface.model}
          value={narrowing.root ?? {}}
          onChange={setRoot}
          depth={0}
          allowRelations
        />
      </Panel>

      <Panel title="mapDefaults (applies everywhere)">
        <Row>
          <Select
            ariaLabel="default map"
            value={addMap}
            placeholder="map…"
            onChange={(v) => {
              setAddMap(v);
              setAddModel('');
            }}
            options={surfaceMaps.map((m) => ({ value: m, label: m }))}
          />
          <Select
            ariaLabel="default model"
            value={addModel}
            placeholder="model…"
            disabled={!addMap}
            onChange={(v) => setAddModel(v)}
            options={addModels.map((m) => ({ value: m, label: m }))}
          />
          <Button
            disabled={!addMap || !addModel || !!defaults[addMap]?.models?.[addModel]}
            onClick={() => {
              setDefaultModel(addMap, addModel, {});
              setAddModel('');
            }}
          >
            Add default
          </Button>
        </Row>
        {Object.entries(defaults).flatMap(([mp, d]) =>
          Object.entries(d.models ?? {}).map(([md, node]) => (
            <div key={`${mp}.${md}`} style={{ display: 'grid', gap: 6 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Badge>
                  {mp}.{md} default
                </Badge>
                <Button variant="danger" onClick={() => setDefaultModel(mp, md, null)}>
                  remove
                </Button>
              </Row>
              <NarrowingNode
                ctx={ctx}
                mapName={mp}
                model={md}
                value={node as ModelNarrowing}
                onChange={(n) => setDefaultModel(mp, md, n)}
                depth={1}
                allowRelations={false}
              />
            </div>
          )),
        )}
      </Panel>

      <Panel title="Validation & exposed surface">
        {analysis.error ? (
          <Badge tone="danger">{analysis.error}</Badge>
        ) : (
          <>
            <Badge tone="ok">valid — validateNarrowing passed</Badge>
            <div style={{ fontSize: 12 }}>
              <div
                style={{
                  fontWeight: 600,
                  color: tokens.textMuted,
                  marginBottom: 4,
                }}
              >
                visible fields on {parentSurface.mapName}.{parentSurface.model}
              </div>
              <Row>
                {analysis.fields.map((f) => (
                  <Badge key={f.name} tone={f.enumValues ? 'accent' : 'muted'}>
                    {f.name}
                    {f.enumValues ? ` (${f.enumValues.length})` : ''}
                  </Badge>
                ))}
              </Row>
            </div>
          </>
        )}
      </Panel>

      <Panel title="Narrowing (reference JSON)">
        <Empty>
          The serializable narrowing you author &amp; save — a <strong>parent ref</strong> + restriction chain. The{' '}
          <strong>projected</strong> surface is in "Validation &amp; exposed surface" above.
        </Empty>
        <Code>{JSON.stringify(draft, null, 2)}</Code>
      </Panel>
    </div>
  );
};
