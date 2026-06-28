import { type ChangeEvent, useRef, useState } from 'react';
import { defaultWorkspace } from './samples';
import { BridgesTab } from './tabs/BridgesTab';
import { BuilderTab } from './tabs/BuilderTab';
import { FieldmapsTab } from './tabs/FieldmapsTab';
import { LensesTab } from './tabs/LensesTab';
import { PathPickerTab } from './tabs/PathPickerTab';
import { SourcesTab } from './tabs/SourcesTab';
import { Button, tokens } from './ui';
import { emptyWorkspace, exportWorkspace, importWorkspace, type Workspace } from './workspace';

type Section = 'fieldmaps' | 'bridges' | 'lenses' | 'sources' | 'rules' | 'valuepicker';
type Selection = { section: Section; item?: string };
type InvItem = { id: string; label: string };

const bridgeLabel = (b: Workspace['bridges'][number]) =>
  `${b.endpoints[0].fieldMap}:${b.endpoints[0].model} ↔ ${b.endpoints[1].fieldMap}:${b.endpoints[1].model}`;

const inventory = (ws: Workspace): { key: Section; label: string; items: InvItem[] }[] => [
  { key: 'fieldmaps', label: 'FieldMaps', items: Object.keys(ws.maps).map((m) => ({ id: m, label: m })) },
  { key: 'bridges', label: 'Bridges', items: ws.bridges.map((b, i) => ({ id: String(i), label: bridgeLabel(b) })) },
  { key: 'lenses', label: 'Lenses', items: Object.keys(ws.narrowings).map((n) => ({ id: n, label: n })) },
  {
    key: 'sources',
    label: 'Sources',
    items: ws.sources.map((s, i) => ({ id: String(i), label: `${s.map}.${s.model}.${s.field}` })),
  },
  { key: 'rules', label: 'Rules', items: [] },
];

export const App = () => {
  const [ws, setWs] = useState<Workspace>(defaultWorkspace);
  const [sel, setSel] = useState<Selection>({ section: 'fieldmaps' });
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = (partial: Partial<Workspace>) => setWs((prev) => ({ ...prev, ...partial }));

  const onExport = () => {
    const blob = new Blob([exportWorkspace(ws)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rules-builder-workspace.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    file.text().then((text) => {
      try {
        setWs(importWorkspace(text));
      } catch (err) {
        alert(`Import failed: ${String(err)}`);
      }
    });
  };

  const editor = (() => {
    switch (sel.section) {
      case 'fieldmaps':
        return <FieldmapsTab ws={ws} patch={patch} />;
      case 'bridges':
        return <BridgesTab ws={ws} patch={patch} />;
      case 'lenses':
        return <LensesTab ws={ws} patch={patch} selected={sel.item} />;
      case 'sources':
        return <SourcesTab ws={ws} patch={patch} />;
      case 'rules':
        return <BuilderTab ws={ws} patch={patch} />;
      case 'valuepicker':
        return <PathPickerTab ws={ws} patch={patch} />;
    }
  })();

  const sections = inventory(ws);

  const navItem = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    padding: '5px 8px',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
    background: active ? tokens.accentBg : 'transparent',
    color: active ? tokens.accent : tokens.text,
    fontWeight: active ? 600 : 400,
    border: 'none',
    width: '100%',
    textAlign: 'left',
  });

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', color: tokens.text, background: tokens.bgMuted, minHeight: '100vh' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '14px 20px',
          borderBottom: `1px solid ${tokens.border}`,
          background: tokens.bg,
        }}
      >
        <div>
          <strong style={{ fontSize: 16 }}>Rules Builder</strong>
          <span style={{ fontSize: 12, color: tokens.textMuted, marginLeft: 10 }}>
            fieldMaps → bridges → lenses → sources → builder → value picker
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={onExport}>Export</Button>
          <Button onClick={() => fileRef.current?.click()}>Import</Button>
          <Button variant="ghost" onClick={() => setWs(emptyWorkspace())} title="Empty workspace">
            Clean
          </Button>
          <Button variant="primary" onClick={() => setWs(defaultWorkspace())} title="Load bundled samples">
            Load sample
          </Button>
          <input ref={fileRef} type="file" accept="application/json" onChange={onImport} style={{ display: 'none' }} />
        </div>
      </header>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: 20, maxWidth: 1200, margin: '0 auto' }}>
        <nav
          style={{
            width: 220,
            flexShrink: 0,
            position: 'sticky',
            top: 20,
            display: 'grid',
            gap: 10,
            background: tokens.bg,
            border: `1px solid ${tokens.border}`,
            borderRadius: tokens.radius,
            padding: 12,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: tokens.textMuted }}>INVENTORY</div>
          {sections.map((s) => (
            <div key={s.key} style={{ display: 'grid', gap: 2 }}>
              <button type="button" style={navItem(sel.section === s.key && !sel.item)} onClick={() => setSel({ section: s.key })}>
                <span>{s.label}</span>
                <span style={{ fontSize: 11, color: tokens.textMuted }}>{s.items.length}</span>
              </button>
              {s.items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  style={{ ...navItem(sel.section === s.key && sel.item === it.id), paddingLeft: 18, fontSize: 12 }}
                  onClick={() => setSel({ section: s.key, item: it.id })}
                >
                  <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.label}
                  </span>
                </button>
              ))}
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${tokens.border}`, paddingTop: 8, display: 'grid', gap: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: tokens.textMuted }}>TOOLS</div>
            <button type="button" style={navItem(sel.section === 'valuepicker')} onClick={() => setSel({ section: 'valuepicker' })}>
              <span>Value Picker</span>
            </button>
          </div>
        </nav>

        <main style={{ flex: 1, minWidth: 0 }}>{editor}</main>
      </div>
    </div>
  );
};
