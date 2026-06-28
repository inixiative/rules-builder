import { type ChangeEvent, type FC, useRef, useState } from 'react';
import { defaultWorkspace } from './samples';
import { BridgesTab } from './tabs/BridgesTab';
import { BuilderTab } from './tabs/BuilderTab';
import { FieldmapsTab } from './tabs/FieldmapsTab';
import { LensesTab } from './tabs/LensesTab';
import { PathPickerTab } from './tabs/PathPickerTab';
import { SourcesTab } from './tabs/SourcesTab';
import type { TabProps } from './tabs/types';
import { Button, tokens } from './ui';
import { exportWorkspace, importWorkspace, type Workspace } from './workspace';

const TABS: { id: string; label: string; Comp: FC<TabProps> }[] = [
  { id: 'fieldmaps', label: '1 · Fieldmaps', Comp: FieldmapsTab },
  { id: 'bridges', label: '2 · Bridges', Comp: BridgesTab },
  { id: 'lenses', label: '3 · Lenses', Comp: LensesTab },
  { id: 'sources', label: '4 · Sources', Comp: SourcesTab },
  { id: 'builder', label: '5 · Builder', Comp: BuilderTab },
  { id: 'pathpicker', label: '6 · Value Picker', Comp: PathPickerTab },
];

export const App = () => {
  const [ws, setWs] = useState<Workspace>(defaultWorkspace);
  const [tab, setTab] = useState('fieldmaps');
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

  const Active = TABS.find((t) => t.id === tab)?.Comp ?? FieldmapsTab;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', color: tokens.text, background: tokens.bgMuted, minHeight: '100vh' }}>
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '32px 20px', display: 'grid', gap: 16 }}>
        <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, margin: 0 }}>Rules Builder — lifecycle playground</h1>
            <p style={{ fontSize: 13, color: tokens.textMuted, margin: '4px 0 0' }}>
              fieldmaps → bridges → lenses → sources → builder
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={onExport}>Export</Button>
            <Button onClick={() => fileRef.current?.click()}>Import</Button>
            <Button variant="ghost" onClick={() => setWs(defaultWorkspace())} title="Reset to bundled samples">
              Reset
            </Button>
            <input ref={fileRef} type="file" accept="application/json" onChange={onImport} style={{ display: 'none' }} />
          </div>
        </header>

        <nav style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${tokens.border}` }}>
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  border: 'none',
                  background: 'none',
                  padding: '8px 12px',
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  color: active ? tokens.accent : tokens.textMuted,
                  borderBottom: active ? `2px solid ${tokens.accent}` : '2px solid transparent',
                  cursor: 'pointer',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        <Active ws={ws} patch={patch} />
      </div>
    </div>
  );
};
