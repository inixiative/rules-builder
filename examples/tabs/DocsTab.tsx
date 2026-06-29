import { Badge, Code, Panel, Row, tokens } from '../ui';

const P = ({ children }: { children: React.ReactNode }) => (
  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: tokens.text }}>{children}</p>
);
const Mono = ({ children }: { children: React.ReactNode }) => (
  <code
    style={{
      fontFamily: 'monospace',
      fontSize: 12,
      background: tokens.bgCode,
      padding: '1px 5px',
      borderRadius: 4,
    }}
  >
    {children}
  </code>
);

const HOOK = `import { useRuleBuilder } from '@inixiative/rules-builder';

const { root, value } = useRuleBuilder({ source, value: { all: [] } });
// walk \`root\` (a descriptor tree) and render it; \`value\` is the clean Condition`;

const NODE = `function Node({ node }) {
  if (node.kind === 'group') return <Group node={node} />;
  if (node.kind === 'array') return <ArrayRule node={node} />;
  return <Leaf node={node} />; // field / operator / value controls
}`;

const SOURCES = `import { runSources } from '@inixiative/rules-builder';

const sourceValues = runSources(narrowing, rows); // DISTINCT options per sourced field
useRuleBuilder({ source, sourceValues });          // sourced fields render as selects`;

const SAVE = `import { stringifySavedRule, parseSavedRule } from '@inixiative/rules-builder';

const json = stringifySavedRule({ source: ref, rule, sourceValues });
const back = parseSavedRule(json); // validated; throws on malformed input`;

export const DocsTab = () => (
  <div style={{ display: 'grid', gap: 16 }}>
    <Panel title="What this is">
      <P>
        <Mono>@inixiative/rules-builder</Mono> is a <strong>headless</strong> rule builder for{' '}
        <Mono>@inixiative/json-rules</Mono>. It owns the <Mono>Condition</Mono> JSON and hands you a{' '}
        <strong>descriptor tree</strong> — what controls exist at each level and the bound actions. It renders nothing;
        you bring the components. This playground is a live reference consumer.
      </P>
      <Row>
        <Badge tone="accent">fieldMaps</Badge>
        <span>→</span>
        <Badge tone="accent">bridges</Badge>
        <span>→</span>
        <Badge tone="accent">lenses</Badge>
        <span>→</span>
        <Badge tone="accent">narrowings (+ sources)</Badge>
        <span>→</span>
        <Badge tone="accent">builder</Badge>
        <span>→</span>
        <Badge tone="accent">value picker</Badge>
      </Row>
    </Panel>

    <Panel title="The hook">
      <P>
        <Mono>useRuleBuilder</Mono> returns <Mono>{'{ value, root, lens, setCondition, validate, describe }'}</Mono>.
        Walk <Mono>root</Mono> and switch on <Mono>node.kind</Mono>:
      </P>
      <Code>{HOOK}</Code>
      <Code>{NODE}</Code>
    </Panel>

    <Panel title="Rendering values">
      <P>
        The hook is headless — it doesn't render value inputs. Switch on the <Mono>ValueControl</Mono>:{' '}
        <Mono>options</Mono> → a select; <Mono>shape === 'array'</Mono> → multi-select; <Mono>kind === 'Boolean'</Mono>{' '}
        → a true/false select (coerce to a real boolean); <Mono>kind === 'Int' | 'Float'</Mono> → number input (coerce
        with <Mono>Number()</Mono>); <Mono>DateTime</Mono> → date input. The two reference renderers (plain + shadcn)
        implement the full matrix — copy one.
      </P>
      <P>
        Per-control validity: <Mono>field.valid</Mono> / <Mono>value.valid</Mono> pinpoint which input is wrong.
      </P>
    </Panel>

    <Panel title="Sourced fields (data-backed options)">
      <P>
        A narrowing declares <Mono>sources</Mono> — a field whose option set is the DISTINCT values of its column after
        an eligibility filter. The engine compiles the queries; your app runs them and hands the values back:
      </P>
      <Code>{SOURCES}</Code>
    </Panel>

    <Panel title="Array (list/relation) rules">
      <P>
        A list/relation field builds an <Mono>ArrayNode</Mono>: <strong>presence</strong> (empty/notEmpty),{' '}
        <strong>count</strong> (atLeast/atMost/exactly + a number), or <strong>predicate</strong> (all/any/none + a
        nested <Mono>condition</Mono>). It also carries a window <Mono>filter</Mono>. Both <Mono>condition</Mono> and{' '}
        <Mono>filter</Mono> are nested groups scoped to the <strong>related model</strong> — author them like the top
        level.
      </P>
    </Panel>

    <Panel title="Serialization">
      <P>
        A rule loses meaning without its binding. <Mono>SavedRule</Mono> packages the rule with a <Mono>source</Mono>{' '}
        reference and the captured <Mono>sourceValues</Mono>:
      </P>
      <Code>{SAVE}</Code>
    </Panel>

    <Panel title="More">
      <P>
        Full API + architecture in the{' '}
        <a href="https://github.com/inixiative/rules-builder" style={{ color: tokens.accent }}>
          README
        </a>
        . Engine docs:{' '}
        <a href="https://github.com/inixiative/json-rules" style={{ color: tokens.accent }}>
          @inixiative/json-rules
        </a>
        .
      </P>
    </Panel>
  </div>
);
