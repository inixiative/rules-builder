import { type FieldMap } from '@inixiative/json-rules';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'bun:test';
import { RuleBuilder } from '../src/builder/RuleBuilder';
import { stubSlots } from './fixtures/stubSlots';

const map: FieldMap = {
  models: {
    User: {
      fields: {
        email: { kind: 'scalar', type: 'String' },
        age: { kind: 'scalar', type: 'Int' },
        role: { kind: 'enum', type: 'UserRole' },
      },
    },
  },
  enums: { UserRole: ['admin', 'member'] },
};

const source = { maps: { app: map }, mapName: 'app', model: 'User' };

afterEach(() => {
  document.body.innerHTML = '';
});

describe('RuleBuilder (integration)', () => {
  test('renders an empty root group with Add rule / Add group', () => {
    render(<RuleBuilder source={source} slots={stubSlots} />);
    expect(screen.getByText('Add rule')).toBeDefined();
    expect(screen.getByText('Add group')).toBeDefined();
    expect(screen.queryByTestId('rule-row')).toBeNull();
  });

  test('Add rule emits a clean condition (no _id/_groupId leaks out)', () => {
    let last: unknown;
    render(<RuleBuilder source={source} slots={stubSlots} onChange={(c) => { last = c; }} />);
    fireEvent.click(screen.getByText('Add rule'));
    expect(last).toEqual({ all: [{ field: 'email', operator: 'equals', value: '' }] });
    expect(JSON.stringify(last)).not.toContain('_id');
    expect(JSON.stringify(last)).not.toContain('_groupId');
  });

  test('a rule row renders field + operator selects', () => {
    render(<RuleBuilder source={source} slots={stubSlots} value={{ all: [{ field: 'email', operator: 'equals', value: '' }] }} />);
    expect(screen.getByTestId('rule-row')).toBeDefined();
    const fieldSelect = screen.getByLabelText('field') as HTMLSelectElement;
    expect(fieldSelect.value).toBe('email');
    expect(screen.getByLabelText('operator')).toBeDefined();
  });

  test('removing the only rule empties the group', () => {
    let last: unknown;
    render(
      <RuleBuilder
        source={source}
        slots={stubSlots}
        value={{ all: [{ field: 'email', operator: 'equals', value: 'x' }] }}
        onChange={(c) => { last = c; }}
      />,
    );
    fireEvent.click(screen.getByLabelText('remove rule'));
    expect(last).toEqual({ all: [] });
  });

  test('switching a value-bearing field to an enum renders a value select', () => {
    render(<RuleBuilder source={source} slots={stubSlots} value={{ all: [{ field: 'role', operator: 'equals', value: '' }] }} />);
    const valueSelect = screen.getByLabelText('value') as HTMLSelectElement;
    const opts = Array.from(valueSelect.options).map((o) => o.value);
    expect(opts).toEqual(['admin', 'member']);
  });
});
