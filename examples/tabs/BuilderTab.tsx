import { check, describeRule, validateRuleInLens } from '@inixiative/json-rules';
import { useEffect, useMemo, useState } from 'react';
import { composeNarrowed, resolve } from '../../src';
import { RuleEditor } from '../RuleTree';
import { RuleEditorShadcn } from '../RuleTreeShadcn';
import { sampleRows, sampleSourceValues } from '../samples';
import { Badge, Button, Code, EditorHeader, Empty, Panel, Row, Select, tokens } from '../ui';
import { type ParentRef, sourceFor } from '../workspace';
import type { TabProps } from './types';

type SourceChoice = { key: string; label: string; ref: ParentRef };
const refKey = (r: ParentRef) => `${r.kind}:${r.name}`;

export const BuilderTab = ({ ws, patch, selected }: TabProps & { selected?: string }) => {
  const choices = useMemo<SourceChoice[]>(
    // Narrowings lead: a bare lens turns no relation on, so it offers the anchor's columns only.
    () => [
      ...Object.keys(ws.narrowings).map((n) => ({
        key: `narrowing:${n}`,
        label: `narrowing · ${n}`,
        ref: { kind: 'narrowing' as const, name: n },
      })),
      ...Object.keys(ws.lenses).map((n) => ({
        key: `lens:${n}`,
        label: `lens · ${n}`,
        ref: { kind: 'lens' as const, name: n },
      })),
    ],
    [ws.lenses, ws.narrowings],
  );

  const [sourceKey, setSourceKey] = useState('');
  const [renderer, setRenderer] = useState<'plain' | 'shadcn'>('shadcn');
  const [decorationName, setDecorationName] = useState('segment');
  const [ruleName, setRuleName] = useState('');
  // The editor is uncontrolled (`rule` is read once at mount), so loading a saved rule
  // remounts it — the counter is part of its key.
  const [loaded, setLoaded] = useState(0);
  const choice = choices.find((c) => c.key === sourceKey) ?? choices[0];

  // Selecting a saved rule from the inventory loads it: its draft + its bound source.
  // biome-ignore lint/correctness/useExhaustiveDependencies: react only to the selection
  useEffect(() => {
    if (selected && ws.rules[selected]) {
      const saved = ws.rules[selected];
      patch({ rule: saved.rule });
      setSourceKey(refKey(saved.source));
      setRuleName(selected);
      setLoaded((n) => n + 1);
    }
  }, [selected]);

  // The surface depends on the workspace's schema, never on the draft rule: a `source`
  // rebuilt on every edit hands the editor a new lens each keystroke, and its emit
  // effect (keyed on the lens) would patch the draft back in a loop.
  const surface = useMemo(() => {
    if (!choice) return null;
    try {
      const source = sourceFor(ws, choice.ref);
      if (!source) throw new Error('surface not resolvable');
      // json-rules materializes each source over the sample rows → fetched values
      // fold into the view so option sets reflect the lens/narrowing, not the raw column.
      const sourceValues = sampleSourceValues(composeNarrowed(source));
      // The gate is the narrowed lens itself, never its projected surface.
      const { lens } = resolve(source, { sourceValues });
      return { error: null as string | null, source, sourceValues, lens };
    } catch (err) {
      return { error: String(err), source: null, sourceValues: [], lens: null };
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: the schema slices, not the draft
  }, [choice, ws.maps, ws.bridges, ws.lenses, ws.narrowings]);

  const analysis = useMemo(() => {
    if (!surface) return null;
    if (!surface.lens) return { ...surface, description: null, check: null };
    return {
      ...surface,
      description: describeRule(ws.rule, surface.lens),
      check: validateRuleInLens(ws.rule, surface.lens),
    };
  }, [surface, ws.rule]);

  if (!choice) {
    return (
      <Panel title="Builder">
        <Empty>Create a lens or narrowing first — the builder authors against one.</Empty>
      </Panel>
    );
  }

  const save = () => {
    const name = ruleName.trim();
    if (!name) return;
    patch({
      rules: {
        ...ws.rules,
        [name]: {
          source: choice.ref,
          rule: ws.rule,
          sourceValues: analysis?.sourceValues,
        },
      },
    });
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <EditorHeader
        title="Rule"
        name={ruleName}
        onName={setRuleName}
        namePlaceholder="rule name"
        saveLabel="Save rule"
        saveDisabled={!ruleName.trim()}
        onSave={save}
        extra={
          <Button variant="ghost" onClick={() => patch({ rule: { all: [] } })}>
            Reset
          </Button>
        }
      />

      <Panel title="Source">
        <Row>
          <label style={{ fontSize: 13, color: tokens.textMuted }}>Author against:</label>
          <Select
            ariaLabel="source"
            value={choice.key}
            onChange={setSourceKey}
            options={choices.map((c) => ({ value: c.key, label: c.label }))}
          />
          <label style={{ fontSize: 13, color: tokens.textMuted }}>Renderer:</label>
          <Select
            ariaLabel="renderer"
            value={renderer}
            onChange={(v) => setRenderer(v as 'plain' | 'shadcn')}
            options={[
              { value: 'shadcn', label: 'shadcn' },
              { value: 'plain', label: 'plain' },
            ]}
          />
          <label style={{ fontSize: 13, color: tokens.textMuted }}>Surface:</label>
          <Select
            ariaLabel="surface"
            value={ws.decorations[decorationName] ? decorationName : ''}
            onChange={setDecorationName}
            options={[
              { value: '', label: 'Raw (backend names)' },
              ...Object.keys(ws.decorations).map((n) => ({ value: n, label: `decorated · ${n}` })),
            ]}
          />
          <span style={{ fontSize: 12, color: tokens.textMuted }}>
            depth {ws.maxDepth} · set in Settings
          </span>
        </Row>
      </Panel>

      <Panel title="Rule">
        {analysis?.error ? (
          <Badge tone="danger">{analysis.error}</Badge>
        ) : analysis?.source && renderer === 'shadcn' ? (
          <RuleEditorShadcn
            key={`${choice.key}:${decorationName}:${loaded}`}
            source={analysis.source}
            sourceValues={analysis.sourceValues}
            maxDepth={ws.maxDepth}
            rule={ws.rule}
            onChange={(rule) => patch({ rule })}
            decoration={ws.decorations[decorationName]}
          />
        ) : analysis?.source ? (
          <RuleEditor
            key={`${choice.key}:${decorationName}:${loaded}`}
            source={analysis.source}
            sourceValues={analysis.sourceValues}
            maxDepth={ws.maxDepth}
            rule={ws.rule}
            onChange={(rule) => patch({ rule })}
            decoration={ws.decorations[decorationName]}
          />
        ) : null}
      </Panel>

      {analysis?.description && analysis.check && (
        <Panel title="Classification">
          <Row>
            <Badge tone="accent">sources: {analysis.description.sources.join(', ') || '—'}</Badge>
            <Badge tone={analysis.description.bridgesCrossed ? 'danger' : 'muted'}>
              bridgesCrossed: {String(analysis.description.bridgesCrossed)}
            </Badge>
            <Badge tone="muted">
              targets: {analysis.description.supportedTargets.join(', ') || '—'}
            </Badge>
            <Badge tone={analysis.check.ok ? 'ok' : 'danger'}>
              validateRuleInLens:{' '}
              {analysis.check.ok ? 'ok' : `${analysis.check.errors.length} error(s)`}
            </Badge>
          </Row>
          {!analysis.check.ok && (
            <div style={{ display: 'grid', gap: 4 }}>
              {analysis.check.errors.map((e, i) => (
                <Badge key={`${e.path}-${i}`} tone="danger">
                  {e.path}: {e.message} ({e.code})
                </Badge>
              ))}
            </div>
          )}
        </Panel>
      )}

      {analysis?.source && (sampleRows[analysis.source.model]?.length ?? 0) > 0 && (
        <Panel title={`Evaluate — sample ${analysis.source.model} rows (check, in memory)`}>
          <div style={{ display: 'grid', gap: 4 }}>
            {sampleRows[analysis.source.model].map((r, i) => {
              const result = (() => {
                try {
                  return check(ws.rule, r);
                } catch (err) {
                  return String(err);
                }
              })();
              const matched = result === true;
              return (
                <Row key={String(r.id ?? i)}>
                  <Badge tone={matched ? 'ok' : 'muted'}>{matched ? '✓ match' : '✗'}</Badge>
                  <code style={{ fontSize: 11, color: tokens.textMuted }}>{JSON.stringify(r)}</code>
                  {typeof result === 'string' && (
                    <span style={{ fontSize: 11, color: tokens.textMuted }}>{result}</span>
                  )}
                </Row>
              );
            })}
          </div>
        </Panel>
      )}

      <Panel title="Condition JSON">
        <Code>{JSON.stringify(ws.rule, null, 2)}</Code>
      </Panel>
    </div>
  );
};
