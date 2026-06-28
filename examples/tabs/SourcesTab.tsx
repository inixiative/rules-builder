import type { Condition, Operator } from '@inixiative/json-rules';
import { useMemo, useState } from 'react';
import { sampleRows } from '../samples';
import { computeAllSources, type WorkspaceSource } from '../sourceExec';
import { Badge, Button, Empty, Panel, Row, tokens } from '../ui';
import type { TabProps } from './types';

const OPERATORS = ['equals', 'notEquals', 'greaterThan', 'lessThan'] as const;

const coerce = (raw: string): string | number | boolean => {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const n = Number(raw);
  return raw.trim() !== '' && !Number.isNaN(n) ? n : raw;
};

const blank = { map: '', model: '', field: '', whereField: '', whereOp: 'equals', whereValue: '' };

export const SourcesTab = ({ ws, patch }: TabProps) => {
  const [draft, setDraft] = useState<Record<string, string>>(blank);
  const sel = { padding: '5px 8px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, fontSize: 13 };
  const inp = { ...sel, width: 120 };

  const models = draft.map ? Object.keys(ws.maps[draft.map]?.models ?? {}) : [];
  const modelFields = draft.map && draft.model ? ws.maps[draft.map]?.models[draft.model]?.fields ?? {} : {};
  const fields = Object.keys(modelFields);
  const scalarFields = fields.filter((f) => modelFields[f]?.kind === 'scalar' || modelFields[f]?.kind === 'enum');

  const computed = useMemo(
    () => computeAllSources(ws.maps, ws.bridges, ws.sources, sampleRows),
    [ws.maps, ws.bridges, ws.sources],
  );

  const addSource = () => {
    if (!draft.map || !draft.model || !draft.field) return;
    const where: Condition = draft.whereField
      ? { all: [{ field: draft.whereField, operator: draft.whereOp as Operator, value: coerce(draft.whereValue) }] }
      : { all: [] };
    const src: WorkspaceSource = { map: draft.map, model: draft.model, field: draft.field, where };
    patch({ sources: [...ws.sources, src] });
    setDraft(blank);
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Declared sources (a field's options = DISTINCT of its column, under a where)">
        <Empty>
          A source turns a column into a pseudo-enum: the engine compiles{' '}
          <code>SELECT DISTINCT field WHERE &lt;narrowing ∧ where&gt;</code> (sourceQueries), the app runs
          it over its rows, and the values decorate the field. The Builder then renders a gated select.
        </Empty>
        {ws.sources.length === 0 ? (
          <Empty>No sources declared.</Empty>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {ws.sources.map((s, i) => {
              const got = computed.find((c) => c.mapName === s.map && c.model === s.model && c.field === s.field);
              return (
                <div key={`${s.map}.${s.model}.${s.field}-${i}`} style={{ display: 'grid', gap: 6 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {s.map}.{s.model}.{s.field} ← DISTINCT({s.field})
                      {' where '}
                      {JSON.stringify(s.where)}
                    </span>
                    <Button
                      variant="danger"
                      onClick={() => patch({ sources: ws.sources.filter((_, idx) => idx !== i) })}
                    >
                      Remove
                    </Button>
                  </Row>
                  <Row>
                    {got && got.values.length > 0 ? (
                      got.values.map((v) => (
                        <Badge key={v} tone="ok">
                          {v}
                        </Badge>
                      ))
                    ) : (
                      <Badge tone="muted">no rows match</Badge>
                    )}
                  </Row>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Declare a source" actions={<Button onClick={addSource}>Add source</Button>}>
        <Row>
          <select style={sel} value={draft.map} onChange={(e) => setDraft({ ...blank, map: e.target.value })}>
            <option value="">map…</option>
            {Object.keys(ws.maps).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            style={sel}
            value={draft.model}
            onChange={(e) => setDraft({ ...draft, model: e.target.value, field: '', whereField: '' })}
            disabled={!draft.map}
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
            value={draft.field}
            onChange={(e) => setDraft({ ...draft, field: e.target.value })}
            disabled={!draft.model}
          >
            <option value="">field…</option>
            {scalarFields.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Row>
        <Row>
          <span style={{ color: tokens.textMuted, fontSize: 12 }}>where (optional):</span>
          <select
            style={sel}
            value={draft.whereField}
            onChange={(e) => setDraft({ ...draft, whereField: e.target.value })}
            disabled={!draft.model}
          >
            <option value="">— no filter —</option>
            {scalarFields.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          {draft.whereField && (
            <>
              <select style={sel} value={draft.whereOp} onChange={(e) => setDraft({ ...draft, whereOp: e.target.value })}>
                {OPERATORS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <input
                style={inp}
                placeholder="value (true/42/text)"
                value={draft.whereValue}
                onChange={(e) => setDraft({ ...draft, whereValue: e.target.value })}
              />
            </>
          )}
        </Row>
        <Empty>Sample rows available for: {Object.keys(sampleRows).join(', ')}.</Empty>
      </Panel>
    </div>
  );
};
