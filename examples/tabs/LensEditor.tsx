import { createLens, exposedSurface, type FieldMap } from '@inixiative/json-rules';
import { useEffect, useMemo, useState } from 'react';
import { describeModelFields } from '../../src/schema/surface';
import { Badge, EditorHeader, Empty, Panel, Row, Select, tokens } from '../ui';
import { lensInput, type SavedLens } from '../workspace';
import type { TabProps } from './types';

const firstAnchor = (maps: Record<string, FieldMap>): SavedLens => {
  const mapName = Object.keys(maps)[0] ?? '';
  return {
    mapName,
    model: mapName ? (Object.keys(maps[mapName].models)[0] ?? '') : '',
    maps: Object.keys(maps),
  };
};

/** A lens = included fieldMaps + an anchor (map.model) + attached bridges. The base reference view; narrowings restrict it. */
export const LensEditor = ({ ws, patch, selected }: TabProps & { selected?: string }) => {
  const [draft, setDraft] = useState<SavedLens>(() => ({
    ...firstAnchor(ws.maps),
    bridges: ws.bridges,
  }));
  const [name, setName] = useState(selected ?? '');

  // biome-ignore lint/correctness/useExhaustiveDependencies: react only to the selection
  useEffect(() => {
    if (selected && ws.lenses[selected]) {
      setDraft(ws.lenses[selected]);
      setName(selected);
    } else if (!selected) {
      setDraft({ ...firstAnchor(ws.maps), bridges: ws.bridges });
      setName('');
    }
  }, [selected]);

  const anchorModels = Object.keys(ws.maps[draft.mapName]?.models ?? {});
  const includedMaps = draft.maps ?? Object.keys(ws.maps);

  const fields = useMemo(() => {
    if (!draft.mapName || !draft.model || !ws.maps[draft.mapName]?.models[draft.model]) return [];
    try {
      const lens = createLens(lensInput(ws, draft));
      return describeModelFields(exposedSurface(lens), draft.mapName, draft.model);
    } catch {
      return [];
    }
  }, [ws, draft]);

  if (Object.keys(ws.maps).length === 0) {
    return (
      <Panel title="Lens">
        <Empty>Load fieldMaps first.</Empty>
      </Panel>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <EditorHeader
        title="Lens"
        name={name}
        onName={setName}
        namePlaceholder="lens name (e.g. app-users)"
        saveDisabled={!name.trim()}
        onSave={() => patch({ lenses: { ...ws.lenses, [name.trim()]: draft } })}
      />

      <Panel title="FieldMaps (include in this lens)">
        <Row>
          {Object.keys(ws.maps).map((m) => {
            const isAnchor = m === draft.mapName;
            const included = isAnchor || includedMaps.includes(m);
            return (
              <label
                key={m}
                style={{
                  fontSize: 12,
                  fontFamily: 'monospace',
                  opacity: isAnchor ? 0.7 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={included}
                  disabled={isAnchor}
                  onChange={() =>
                    setDraft((d) => {
                      const cur = new Set(d.maps ?? Object.keys(ws.maps));
                      if (cur.has(m)) cur.delete(m);
                      else cur.add(m);
                      cur.add(d.mapName); // anchor is always in scope
                      return { ...d, maps: [...cur] };
                    })
                  }
                />{' '}
                {m}
                {isAnchor && ' (anchor)'}
              </label>
            );
          })}
        </Row>
        <Empty>A bridge only connects maps that are both included here.</Empty>
      </Panel>

      <Panel title="Anchor">
        <Row>
          <Select
            ariaLabel="anchor map"
            value={draft.mapName}
            onChange={(mapName) =>
              setDraft((d) => ({
                ...d,
                mapName,
                model: Object.keys(ws.maps[mapName]?.models ?? {})[0] ?? '',
                maps: [...new Set([...(d.maps ?? Object.keys(ws.maps)), mapName])],
              }))
            }
            options={includedMaps.map((m) => ({ value: m, label: m }))}
          />
          <Select
            ariaLabel="anchor model"
            value={draft.model}
            onChange={(model) => setDraft({ ...draft, model })}
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
                  {b.endpoints[0].fieldMap}:{b.endpoints[0].model} ↔ {b.endpoints[1].fieldMap}:
                  {b.endpoints[1].model}
                </label>
              );
            })}
          </Row>
        </Panel>
      )}

      <Panel title="Exposed surface">
        <div style={{ fontSize: 12 }}>
          <div
            style={{
              fontWeight: 600,
              color: tokens.textMuted,
              marginBottom: 4,
            }}
          >
            visible on {draft.mapName}.{draft.model}
          </div>
          <Row>
            {fields.map((f) => (
              <Badge key={f.name} tone={f.enumValues ? 'accent' : 'muted'}>
                {f.name}
                {f.enumValues ? ` (${f.enumValues.length})` : ''}
              </Badge>
            ))}
          </Row>
        </div>
      </Panel>
    </div>
  );
};
