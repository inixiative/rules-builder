import type { ModelNarrowing } from '@inixiative/json-rules';
import { useState } from 'react';
import { defaultWorkspace } from './samples';
import { BridgesTab } from './tabs/BridgesTab';
import { BuilderTab } from './tabs/BuilderTab';
import { FieldmapsTab } from './tabs/FieldmapsTab';
import { LensesTab } from './tabs/LensesTab';
import { PathPickerTab } from './tabs/PathPickerTab';
import { SettingsTab } from './tabs/SettingsTab';
import { tokens } from './ui';
import type { SavedLens, Workspace } from './workspace';

type Section = 'fieldmaps' | 'bridges' | 'lenses' | 'rules' | 'valuepicker' | 'settings';
type Selection = { section: Section; item?: string };
type InvItem = { id: string; label: string; children?: InvItem[] };

const bridgeLabel = (b: Workspace['bridges'][number]) =>
  `${b.endpoints[0].fieldMap}:${b.endpoints[0].model} ↔ ${b.endpoints[1].fieldMap}:${b.endpoints[1].model}`;

/** A lens's sources live in its narrowing (root + mapDefaults + relations) — collect them for the tree. */
const collectLensSources = (lens: SavedLens): InvItem[] => {
  const out: InvItem[] = [];
  const fromModel = (m: ModelNarrowing | undefined, modelLabel: string) => {
    if (!m) return;
    for (const f of Object.keys(m.sources ?? {})) out.push({ id: `${modelLabel}.${f}`, label: `${modelLabel}.${f}` });
    for (const [rel, sub] of Object.entries(m.relations ?? {})) fromModel(sub, rel);
  };
  const n = lens.narrowing;
  if (n?.root) fromModel(n.root, lens.model);
  for (const md of Object.values(n?.mapDefaults ?? {})) {
    for (const [model, mm] of Object.entries(md.models ?? {})) fromModel(mm as ModelNarrowing, model);
  }
  return out;
};

const inventory = (ws: Workspace): { key: Section; label: string; items: InvItem[] }[] => [
  { key: 'fieldmaps', label: 'FieldMaps', items: Object.keys(ws.maps).map((m) => ({ id: m, label: m })) },
  { key: 'bridges', label: 'Bridges', items: ws.bridges.map((b, i) => ({ id: String(i), label: bridgeLabel(b) })) },
  {
    key: 'lenses',
    label: 'Lenses',
    items: Object.entries(ws.narrowings).map(([n, lens]) => ({ id: n, label: n, children: collectLensSources(lens) })),
  },
  { key: 'rules', label: 'Rules', items: Object.keys(ws.rules).map((n) => ({ id: n, label: n })) },
];

export const App = () => {
  const [ws, setWs] = useState<Workspace>(defaultWorkspace);
  const [sel, setSel] = useState<Selection>({ section: 'fieldmaps' });

  const patch = (partial: Partial<Workspace>) => setWs((prev) => ({ ...prev, ...partial }));

  const selectItem = (section: Section, id: string) => {
    if (section === 'rules') patch({ rule: ws.rules[id] });
    setSel({ section, item: id });
  };

  const removeItem = (section: Section, id: string) => {
    if (section === 'fieldmaps') {
      const { [id]: _, ...rest } = ws.maps;
      patch({ maps: rest });
    } else if (section === 'bridges') {
      patch({ bridges: ws.bridges.filter((_, i) => String(i) !== id) });
    } else if (section === 'lenses') {
      const { [id]: _, ...rest } = ws.narrowings;
      patch({ narrowings: rest });
    } else if (section === 'rules') {
      const { [id]: _, ...rest } = ws.rules;
      patch({ rules: rest });
    }
    setSel((s) => (s.section === section && s.item === id ? { section } : s));
  };

  const editor = (() => {
    switch (sel.section) {
      case 'fieldmaps':
        return <FieldmapsTab ws={ws} patch={patch} selected={sel.item} />;
      case 'bridges':
        return <BridgesTab ws={ws} patch={patch} />;
      case 'lenses':
        return <LensesTab ws={ws} patch={patch} selected={sel.item} />;
      case 'rules':
        return <BuilderTab ws={ws} patch={patch} />;
      case 'valuepicker':
        return <PathPickerTab ws={ws} patch={patch} />;
      case 'settings':
        return <SettingsTab ws={ws} patch={patch} replace={setWs} />;
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

  const labelBtn: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    color: 'inherit',
    font: 'inherit',
    textAlign: 'left',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', color: tokens.text, background: tokens.bgMuted, minHeight: '100vh' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          padding: '14px 20px',
          borderBottom: `1px solid ${tokens.border}`,
          background: tokens.bg,
        }}
      >
        <strong style={{ fontSize: 16 }}>Rules Builder</strong>
        <span style={{ fontSize: 12, color: tokens.textMuted }}>
          fieldMaps → bridges → lenses (+ sources) → builder → value picker
        </span>
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
                <div key={it.id} style={{ display: 'grid', gap: 2 }}>
                  <div style={{ ...navItem(sel.section === s.key && sel.item === it.id), paddingLeft: 18, fontSize: 12 }}>
                    <button type="button" onClick={() => selectItem(s.key, it.id)} style={labelBtn}>
                      {it.label}
                    </button>
                    <button
                      type="button"
                      aria-label={`remove ${it.label}`}
                      title="remove"
                      onClick={() => removeItem(s.key, it.id)}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: tokens.textMuted, padding: '0 2px' }}
                    >
                      ✕
                    </button>
                  </div>
                  {it.children?.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      title="source — edit in the lens"
                      onClick={() => setSel({ section: s.key, item: it.id })}
                      style={{ ...navItem(false), paddingLeft: 34, fontSize: 11, color: tokens.textMuted }}
                    >
                      <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        ↳ {c.label}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${tokens.border}`, paddingTop: 8, display: 'grid', gap: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: tokens.textMuted }}>TOOLS</div>
            <button type="button" style={navItem(sel.section === 'valuepicker')} onClick={() => setSel({ section: 'valuepicker' })}>
              <span>Value Picker</span>
            </button>
            <button type="button" style={navItem(sel.section === 'settings')} onClick={() => setSel({ section: 'settings' })}>
              <span>⚙ Settings</span>
            </button>
          </div>
        </nav>

        <main style={{ flex: 1, minWidth: 0 }}>{editor}</main>
      </div>
    </div>
  );
};
