import {
  createLens,
  exposedSurface,
  type ModelNarrowing,
  stitchFieldMaps,
  validateNarrowing,
} from '@inixiative/json-rules';
import { useEffect, useMemo, useState } from 'react';
import { describeModelFields } from '../../src/schema/surface';
import { sampleRows } from '../samples';
import { runSources } from '../sourceExec';
import { Badge, Button, Code, Empty, Panel, Row, Select, tokens } from '../ui';
import type { SavedLens } from '../workspace';
import { NarrowingNode, type NodeCtx } from './NarrowingNode';
import type { TabProps } from './types';

const firstAnchor = (maps: Record<string, { models: Record<string, unknown> }>) => {
  const mapName = Object.keys(maps)[0] ?? '';
  const model = mapName ? Object.keys(maps[mapName].models)[0] ?? '' : '';
  return { mapName, model };
};

export const LensesTab = ({ ws, patch, selected }: TabProps & { selected?: string }) => {
  const [draft, setDraft] = useState<SavedLens>(() => ({ ...firstAnchor(ws.maps), bridges: ws.bridges, narrowing: {} }));
  const [name, setName] = useState(selected ?? '');
  const [addMap, setAddMap] = useState('');
  const [addModel, setAddModel] = useState('');

  // The sidebar drives the draft: a lens item loads it; the section header (no item) starts a fresh lens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: react only to the selection
  useEffect(() => {
    if (selected && ws.narrowings[selected]) {
      setDraft(ws.narrowings[selected]);
      setName(selected);
    } else if (!selected) {
      setDraft({ ...firstAnchor(ws.maps), bridges: ws.bridges, narrowing: {} });
      setName('');
    }
  }, [selected]);

  const sourceValues = useMemo(() => {
    if (!draft.mapName || !draft.model || !ws.maps[draft.mapName]?.models[draft.model]) return [];
    try {
      const parent = createLens({ maps: ws.maps, bridges: draft.bridges ?? [], mapName: draft.mapName, model: draft.model });
      const narrowed = draft.narrowing ? { parent, ...draft.narrowing } : parent;
      return runSources(narrowed, sampleRows);
    } catch {
      return [];
    }
  }, [ws.maps, draft]);
  // Stitch the lens's attached bridges so the narrowing editor surfaces bridge relations.
  const stitchedMaps = useMemo(
    () => stitchFieldMaps({ maps: ws.maps, bridges: draft.bridges ?? [] }).maps,
    [ws.maps, draft.bridges],
  );
  const ctx: NodeCtx = { maps: stitchedMaps, bridges: [], sourceValues };
  const narrowing = draft.narrowing ?? {};
  const defaults = narrowing.mapDefaults ?? {};

  const setRoot = (root: ModelNarrowing) =>
    setDraft((d) => ({ ...d, narrowing: { ...d.narrowing, root } }));

  const setDefaultModel = (mp: string, md: string, node: ModelNarrowing | null) =>
    setDraft((d) => {
      const all = structuredClone(d.narrowing?.mapDefaults ?? {});
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

  const analysis = useMemo(() => {
    if (!draft.mapName || !draft.model) return { error: 'No anchor.', fields: [] as ReturnType<typeof describeModelFields> };
    try {
      const parent = createLens({ maps: ws.maps, bridges: draft.bridges ?? [], mapName: draft.mapName, model: draft.model });
      const full = { parent, ...(draft.narrowing ?? {}) };
      validateNarrowing(full);
      const surface = exposedSurface(full, { sourceValues });
      return { error: null as string | null, fields: describeModelFields(surface, draft.mapName, draft.model) };
    } catch (err) {
      return { error: String(err), fields: [] as ReturnType<typeof describeModelFields> };
    }
  }, [ws.maps, ws.bridges, draft, sourceValues]);

  if (Object.keys(ws.maps).length === 0) {
    return (
      <Panel title="Lenses">
        <Empty>Load fieldmaps first (tab 1).</Empty>
      </Panel>
    );
  }

  const anchorModels = Object.keys(ws.maps[draft.mapName]?.models ?? {});
  const addModels = Object.keys(ws.maps[addMap]?.models ?? {});
  const sel = { padding: '5px 8px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, fontSize: 13 };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Anchor">
        <Row>
          <Select
            ariaLabel="anchor map"
            style={sel}
            value={draft.mapName}
            onChange={(mapName) => {
              const model = Object.keys(ws.maps[mapName]?.models ?? {})[0] ?? '';
              setDraft({ mapName, model, bridges: draft.bridges, narrowing: {} });
            }}
            options={Object.keys(ws.maps).map((m) => ({ value: m, label: m }))}
          />
          <Select
            ariaLabel="anchor model"
            style={sel}
            value={draft.model}
            onChange={(model) => setDraft({ mapName: draft.mapName, model, bridges: draft.bridges, narrowing: {} })}
            options={anchorModels.map((m) => ({ value: m, label: m }))}
          />
        </Row>
      </Panel>

      {ws.bridges.length > 0 && (
        <Panel title="Bridges (attach to this lens)">
          <Row>
            {ws.bridges.map((b, i) => {
              const key = JSON.stringify(b);
              const attached = (draft.bridges ?? []).some((x) => JSON.stringify(x) === key);
              return (
                <label key={`${key}-${i}`} style={{ fontSize: 12, fontFamily: 'monospace' }}>
                  <input
                    type="checkbox"
                    checked={attached}
                    onChange={() =>
                      setDraft((d) => ({
                        ...d,
                        bridges: attached
                          ? (d.bridges ?? []).filter((x) => JSON.stringify(x) !== key)
                          : [...(d.bridges ?? []), b],
                      }))
                    }
                  />{' '}
                  {b.endpoints[0].fieldMap}:{b.endpoints[0].model} ↔ {b.endpoints[1].fieldMap}:{b.endpoints[1].model}
                </label>
              );
            })}
          </Row>
        </Panel>
      )}

      <Panel title="Root narrowing (path-specific)">
        <NarrowingNode
          ctx={ctx}
          mapName={draft.mapName}
          model={draft.model}
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
            style={sel}
            value={addMap}
            placeholder="map…"
            onChange={(v) => {
              setAddMap(v);
              setAddModel('');
            }}
            options={Object.keys(ws.maps).map((m) => ({ value: m, label: m }))}
          />
          <Select
            ariaLabel="default model"
            style={sel}
            value={addModel}
            placeholder="model…"
            disabled={!addMap}
            onChange={(v) => setAddModel(v)}
            options={addModels.map((m) => ({ value: m, label: m }))}
          />
          <Button
            disabled={!addMap || !addModel || !!defaults[addMap]?.models?.[addModel]}
            onClick={() => { setDefaultModel(addMap, addModel, {}); setAddModel(''); }}
          >
            Add default
          </Button>
        </Row>
        {Object.entries(defaults).flatMap(([mp, d]) =>
          Object.entries(d.models ?? {}).map(([md, node]) => (
            <div key={`${mp}.${md}`} style={{ display: 'grid', gap: 6 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Badge>{mp}.{md} default</Badge>
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
              <div style={{ fontWeight: 600, color: tokens.textMuted, marginBottom: 4 }}>
                visible fields on {draft.mapName}.{draft.model}
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

      <Panel
        title="Save lens"
        actions={
          <Button
            variant="primary"
            disabled={!name.trim() || !!analysis.error}
            onClick={() => {
              patch({ narrowings: { ...ws.narrowings, [name.trim()]: draft } });
              setName('');
            }}
          >
            Save
          </Button>
        }
      >
        <Row>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="lens name (e.g. vip-active)"
            style={{ ...sel, flex: 1 }}
          />
        </Row>
        {Object.keys(ws.narrowings).length > 0 && (
          <div style={{ display: 'grid', gap: 6 }}>
            {Object.entries(ws.narrowings).map(([n, lens]) => (
              <Row key={n} style={{ justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 13 }}>
                  {n} · {lens.mapName}.{lens.model}
                </span>
                <Row>
                  <Button onClick={() => setDraft(lens)}>Load</Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      const rest = { ...ws.narrowings };
                      delete rest[n];
                      patch({ narrowings: rest });
                    }}
                  >
                    Delete
                  </Button>
                </Row>
              </Row>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Narrowing (reference JSON)">
        <Empty>
          The serializable narrowing you author &amp; save — the lens's <strong>reference</strong> form. The{' '}
          <strong>projected</strong> surface (what a consumer actually sees) is in "Validation &amp; exposed surface" above.
        </Empty>
        <Code>{JSON.stringify(draft.narrowing ?? {}, null, 2)}</Code>
      </Panel>
    </div>
  );
};
