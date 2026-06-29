import type { ActionGroupNode, ActionLeafNode, ActionRuleKind, ActionRuleNode } from '../src';
import { RuleTree } from './RuleTree';
import { Badge, Row, Select, tokens } from './ui';

/**
 * Reference renderer for the permission algebra (`useActionRuleBuilder`'s `root`).
 * Each node is a kind picker + the controls for that variant; the `rule` (abac) leaf
 * embeds the json-rules RuleTree, and `any`/`all` recurse. Copy + restyle.
 */

const isGroup = (n: ActionRuleNode): n is ActionGroupNode => 'children' in n;

const subLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: tokens.textMuted,
};

const ActionNode = ({ node }: { node: ActionRuleNode }) => {
  const group = isGroup(node);
  const leaf = group ? null : (node as ActionLeafNode);
  const accent = group ? '#2b8a3e' : node.kind.value === 'deny' ? tokens.danger : '#7048e8';

  return (
    <div
      style={{
        border: `1px solid ${tokens.border}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 8,
        padding: 10,
        display: 'grid',
        gap: 8,
        background: group ? tokens.bgMuted : tokens.bg,
      }}
    >
      <Row>
        <Select
          ariaLabel="rule kind"
          value={node.kind.value}
          onChange={(v) => node.kind.set(v as ActionRuleKind)}
          options={node.kind.options}
        />

        {leaf?.delegate && (
          <Select
            ariaLabel="delegate action"
            value={leaf.delegate.value ?? ''}
            placeholder="action…"
            onChange={leaf.delegate.set}
            options={leaf.delegate.options}
          />
        )}

        {leaf?.self && (
          <Select
            ariaLabel="self field"
            value={leaf.self.value ?? ''}
            placeholder="field…"
            onChange={leaf.self.set}
            options={leaf.self.options}
          />
        )}

        {leaf?.rel && (
          <>
            {leaf.rel.segments.map((seg, i) => (
              <span key={`${i}-${seg.value}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {i > 0 && <span style={{ color: tokens.textMuted }}>.</span>}
                <Select
                  ariaLabel={`relation hop ${i + 1}`}
                  value={seg.value ?? ''}
                  placeholder="relation…"
                  onChange={seg.set}
                  options={seg.options}
                />
              </span>
            ))}
            {leaf.rel.addOptions.length > 0 && (
              <Select
                ariaLabel="add hop"
                value=""
                placeholder={leaf.rel.segments.length ? '+ hop…' : 'relation…'}
                onChange={leaf.rel.addSegment}
                options={leaf.rel.addOptions}
              />
            )}
            {leaf.rel.removeLast && (
              <button
                type="button"
                title="remove last hop"
                onClick={leaf.rel.removeLast}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: tokens.textMuted }}
              >
                −
              </button>
            )}
            <span style={{ color: tokens.textMuted }}>→</span>
            <Select
              ariaLabel="relation action"
              value={leaf.rel.action.value ?? ''}
              placeholder="action…"
              onChange={leaf.rel.action.set}
              options={leaf.rel.action.options}
            />
            {leaf.rel.target && <Badge tone="muted">{leaf.rel.target}</Badge>}
          </>
        )}

        {node.kind.value === 'deny' && <Badge tone="danger">deny</Badge>}

        {node.remove && (
          <button
            type="button"
            aria-label="remove"
            onClick={node.remove}
            style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: tokens.textMuted }}
          >
            ✕
          </button>
        )}
      </Row>

      {leaf?.rule && (
        <div style={{ display: 'grid', gap: 4 }}>
          <span style={subLabel}>predicate</span>
          <RuleTree root={leaf.rule} />
        </div>
      )}

      {group && (
        <div style={{ display: 'grid', gap: 8, marginLeft: 8 }}>
          {(node as ActionGroupNode).children.map((c) => (
            <ActionNode key={c.id} node={c} />
          ))}
          {(node as ActionGroupNode).addChild && (
            <button
              type="button"
              onClick={(node as ActionGroupNode).addChild}
              style={{
                justifySelf: 'start',
                padding: '4px 8px',
                borderRadius: 6,
                border: `1px solid ${tokens.borderStrong}`,
                background: tokens.bg,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              + rule
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export const ActionRuleTree = ({ root }: { root: ActionRuleNode }) => <ActionNode node={root} />;
