import { type Bridge, type FieldMap, validateFieldMapSet } from '@inixiative/json-rules';
import { type ChangeEvent, useRef, useState } from 'react';
import { defaultWorkspace } from '../samples';
import { Badge, Button, Empty, Panel, Row, Select, tokens } from '../ui';
import { emptyWorkspace, exportWorkspace, importWorkspace, type Workspace } from '../workspace';

type ImportType = 'workspace' | 'maps' | 'bridges';

const IMPORT_TYPES: { value: ImportType; label: string }[] = [
  { value: 'workspace', label: 'Full workspace' },
  { value: 'maps', label: 'FieldMaps' },
  { value: 'bridges', label: 'Bridges' },
];

export const SettingsTab = ({
  ws,
  patch,
  replace,
}: {
  ws: Workspace;
  patch: (p: Partial<Workspace>) => void;
  replace: (w: Workspace) => void;
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<ImportType>('workspace');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [openJson, setOpenJson] = useState(() => exportWorkspace(ws));
  const [openErr, setOpenErr] = useState<string | null>(null);

  const applyOpen = () => {
    try {
      replace(importWorkspace(openJson));
      setOpenErr(null);
    } catch (err) {
      setOpenErr(String(err));
    }
  };

  const onExport = () => {
    const blob = new Blob([exportWorkspace(ws)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rules-builder-workspace.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    file.text().then((text) => {
      try {
        replace(importWorkspace(text));
        setError(null);
        setOk('Imported workspace from file.');
      } catch (err) {
        setError(String(err));
      }
    });
  };

  const loadRaw = () => {
    try {
      const parsed: unknown = JSON.parse(draft);
      switch (type) {
        case 'workspace':
          replace(importWorkspace(draft));
          break;
        case 'maps':
          validateFieldMapSet({ maps: parsed as Record<string, FieldMap> });
          patch({ maps: parsed as Record<string, FieldMap> });
          break;
        case 'bridges':
          if (!Array.isArray(parsed)) throw new Error('Bridges must be a JSON array');
          patch({ bridges: parsed as Bridge[] });
          break;
      }
      setError(null);
      setOk(`Loaded ${type}.`);
      setDraft('');
    } catch (err) {
      setOk(null);
      setError(String(err));
    }
  };

  const placeholder: Record<ImportType, string> = {
    workspace: '{ "maps": {...}, "bridges": [...], "narrowings": {...}, "rule": {...}, "rules": {...} }',
    maps: '{ "app": { "models": { "User": { "fields": { "email": { "kind": "scalar", "type": "String" } } } } } }',
    bridges: '[ { "endpoints": [ {...}, {...} ], "cardinality": "oneToMany" } ]',
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Workspace">
        <Row>
          <Button onClick={onExport}>Export</Button>
          <Button onClick={() => fileRef.current?.click()}>Import file</Button>
          <Button variant="ghost" onClick={() => replace(emptyWorkspace())} title="Empty workspace">
            Clean
          </Button>
          <Button variant="primary" onClick={() => replace(defaultWorkspace())} title="Bundled samples">
            Load sample
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            onChange={onImportFile}
            style={{ display: 'none' }}
          />
        </Row>
        <Row>
          <Badge>{Object.keys(ws.maps).length} maps</Badge>
          <Badge>{ws.bridges.length} bridges</Badge>
          <Badge>{Object.keys(ws.lenses).length} lenses</Badge>
          <Badge>{Object.keys(ws.narrowings).length} narrowings</Badge>
          <Badge>{Object.keys(ws.rules).length} rules</Badge>
        </Row>
        <Row>
          <label style={{ fontSize: 13, color: tokens.textMuted }}>Rule depth</label>
          <Select
            ariaLabel="rule depth"
            value={String(ws.maxDepth)}
            onChange={(v) => patch({ maxDepth: Number(v) })}
            options={[1, 2, 3, 4, 5, 6, 8].map((n) => ({
              value: String(n),
              label: String(n),
            }))}
          />
          <span style={{ fontSize: 12, color: tokens.textMuted }}>max group nesting — applies to every rule field</span>
        </Row>
      </Panel>

      <Panel
        title="Import from JSON"
        actions={
          <Row>
            <Select
              ariaLabel="import type"
              value={type}
              options={IMPORT_TYPES}
              onChange={(v) => setType(v as ImportType)}
            />
            <Button onClick={loadRaw} disabled={!draft.trim()}>
              Load
            </Button>
          </Row>
        }
      >
        <Empty>
          Paste JSON and pick its type. Full workspace replaces everything; the others replace just that slice.
        </Empty>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder[type]}
          spellCheck={false}
          style={{
            width: '100%',
            minHeight: 140,
            fontFamily: 'monospace',
            fontSize: 12,
            padding: 10,
            borderRadius: 6,
            border: `1px solid ${tokens.borderStrong}`,
            resize: 'vertical',
          }}
        />
        {error && <Badge tone="danger">{error}</Badge>}
        {ok && <Badge tone="ok">{ok}</Badge>}
      </Panel>

      <Panel
        title="Workspace JSON (open editor)"
        actions={
          <Row>
            <Button onClick={() => setOpenJson(exportWorkspace(ws))}>Reload</Button>
            <Button variant="primary" onClick={applyOpen}>
              Apply
            </Button>
          </Row>
        }
      >
        <Empty>
          The entire workspace as editable JSON — tweak and Apply to replace everything (Reload re-reads the current
          state).
        </Empty>
        <textarea
          value={openJson}
          onChange={(e) => setOpenJson(e.target.value)}
          spellCheck={false}
          style={{
            width: '100%',
            minHeight: 280,
            fontFamily: 'monospace',
            fontSize: 12,
            padding: 10,
            borderRadius: 6,
            border: `1px solid ${tokens.borderStrong}`,
            resize: 'vertical',
          }}
        />
        {openErr && <Badge tone="danger">{openErr}</Badge>}
      </Panel>
    </div>
  );
};
