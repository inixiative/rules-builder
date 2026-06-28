import { checkRuleAgainstLens, createLens, describeRule } from '@inixiative/json-rules';
import { useMemo, useState } from 'react';
import { resolve, type RuleBuilderSource } from '../../src/schema/surface';
import { RuleEditor } from '../RuleTree';
import { RuleEditorShadcn } from '../RuleTreeShadcn';
import { sampleRows } from '../samples';
import { injectSources, runSources } from '../sourceExec';
import { Badge, Button, Code, Empty, Panel, Row, Select, tokens } from '../ui';
import type { TabProps } from './types';

type SourceChoice = {
  key: string;
  label: string;
  mapName: string;
  model: string;
  narrowing?: RuleBuilderSource['narrowing'];
  bridges?: RuleBuilderSource['bridges'];
};

export const BuilderTab = ({ ws, patch }: TabProps) => {
  const choices = useMemo<SourceChoice[]>(() => {
    const list: SourceChoice[] = [];
    for (const [name, lens] of Object.entries(ws.narrowings)) {
      list.push({
        key: `lens:${name}`,
        label: `lens · ${name} (${lens.mapName}.${lens.model})`,
        mapName: lens.mapName,
        model: lens.model,
        narrowing: lens.narrowing,
        bridges: lens.bridges,
      });
    }
    for (const [mapName, map] of Object.entries(ws.maps)) {
      for (const model of Object.keys(map.models)) {
        list.push({ key: `raw:${mapName}.${model}`, label: `raw · ${mapName}.${model}`, mapName, model });
      }
    }
    return list;
  }, [ws.maps, ws.narrowings]);

  const [selected, setSelected] = useState('');
  const [renderer, setRenderer] = useState<'plain' | 'shadcn'>('shadcn');
  const choice = choices.find((c) => c.key === selected) ?? choices[0];

  const analysis = useMemo(() => {
    if (!choice) return null;
    try {
      // Compose source eligibility with this lens's narrowing and run it over the
      // sample rows → fetched values are passed to resolve (folded in the projection),
      // so the option sets are narrowed by the selected lens, not the raw column.
      const narrowing = injectSources(choice.narrowing ?? {}, ws.sources);
      const bridges = choice.bridges ?? ws.bridges;
      const base = createLens({ maps: ws.maps, bridges, mapName: choice.mapName, model: choice.model });
      const sourceValues = runSources({ parent: base, ...narrowing }, sampleRows);
      const source: RuleBuilderSource = {
        maps: ws.maps,
        bridges,
        mapName: choice.mapName,
        model: choice.model,
        narrowing,
      };
      const surface = resolve(source, { sourceValues });
      return {
        error: null as string | null,
        source,
        sourceValues,
        description: describeRule(ws.rule, surface),
        check: checkRuleAgainstLens(ws.rule, surface),
      };
    } catch (err) {
      return { error: String(err), source: null, sourceValues: [], description: null, check: null };
    }
  }, [choice, ws.maps, ws.bridges, ws.sources, ws.rule]);

  if (!choice) {
    return (
      <Panel title="Builder">
        <Empty>Load fieldmaps first (tab 1).</Empty>
      </Panel>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Source">
        <Row>
          <label style={{ fontSize: 13, color: tokens.textMuted }}>Load lens / anchor:</label>
          <Select
            ariaLabel="source"
            value={choice.key}
            onChange={setSelected}
            options={choices.map((c) => ({ value: c.key, label: c.label }))}
          />
          <Button variant="ghost" onClick={() => patch({ rule: { all: [] } })}>
            Reset rule
          </Button>
        </Row>
        <Row>
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
          <span style={{ fontSize: 12, color: tokens.textMuted }}>same headless hook, different renderer</span>
        </Row>
      </Panel>

      <Panel title="Rule">
        {analysis?.error ? (
          <Badge tone="danger">{analysis.error}</Badge>
        ) : analysis?.source && renderer === 'shadcn' ? (
          <RuleEditorShadcn
            key={choice.key}
            source={analysis.source}
            sourceValues={analysis.sourceValues}
            rule={ws.rule}
            onChange={(rule) => patch({ rule })}
          />
        ) : analysis?.source ? (
          <RuleEditor
            key={choice.key}
            source={analysis.source}
            sourceValues={analysis.sourceValues}
            rule={ws.rule}
            onChange={(rule) => patch({ rule })}
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
            <Badge tone="muted">targets: {analysis.description.supportedTargets.join(', ') || '—'}</Badge>
            <Badge tone={analysis.check.ok ? 'ok' : 'danger'}>
              checkRuleAgainstLens: {analysis.check.ok ? 'ok' : `${analysis.check.violations.length} violation(s)`}
            </Badge>
          </Row>
          {!analysis.check.ok && (
            <div style={{ display: 'grid', gap: 4 }}>
              {analysis.check.violations.map((v, i) => (
                <Badge key={`${v.path}-${i}`} tone="danger">
                  {v.path}: {v.reason}
                </Badge>
              ))}
            </div>
          )}
        </Panel>
      )}

      <Panel title="Condition JSON">
        <Code>{JSON.stringify(ws.rule, null, 2)}</Code>
      </Panel>
    </div>
  );
};
