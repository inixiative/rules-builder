import { afterEach, describe, expect, test } from 'bun:test';
import type { FieldMap } from '@inixiative/json-rules';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RuleEditor } from '../examples/RuleTree';

afterEach(cleanup);

const map: FieldMap = {
  models: {
    User: {
      fields: {
        tier: { kind: 'scalar', type: 'String', values: ['gold', 'silver'] },
        age: { kind: 'scalar', type: 'Int' },
      },
    },
  },
};
const source = { maps: { app: map }, mapName: 'app', model: 'User' };

describe('RuleEditor (reference renderer over the headless hook)', () => {
  test('renders field/operator controls and a gated value select for a leaf', () => {
    render(<RuleEditor source={source} rule={{ all: [{ field: 'tier', operator: 'equals', value: 'gold' }] }} />);
    expect((screen.getByLabelText('field') as HTMLSelectElement).value).toBe('tier');
    expect(screen.getByLabelText('operator')).toBeDefined();
    const value = screen.getByLabelText('value') as HTMLSelectElement;
    expect(Array.from(value.options).map((o) => o.value)).toEqual(['', 'gold', 'silver']);
  });

  test('+ rule adds a row, remove takes it away', () => {
    render(<RuleEditor source={source} rule={{ all: [] }} />);
    expect(screen.queryAllByLabelText('field')).toHaveLength(0);
    fireEvent.click(screen.getByText('+ rule'));
    expect(screen.queryAllByLabelText('field')).toHaveLength(1);
    fireEvent.click(screen.getByLabelText('remove'));
    expect(screen.queryAllByLabelText('field')).toHaveLength(0);
  });
});
