import type { Condition, FieldMap } from '@inixiative/json-rules';
import { useState } from 'react';
import { RuleBuilder } from '../src/builder/RuleBuilder';
import type { RuleBuilderSource } from '../src/schema/surface';
import { exampleSlots } from './slots';

const userMap: FieldMap = {
  models: {
    User: {
      fields: {
        email: { kind: 'scalar', type: 'String' },
        age: { kind: 'scalar', type: 'Int' },
        role: { kind: 'enum', type: 'UserRole' },
        active: { kind: 'scalar', type: 'Boolean' },
        createdAt: { kind: 'scalar', type: 'DateTime' },
      },
    },
  },
  enums: { UserRole: ['admin', 'member', 'guest'] },
};

const source: RuleBuilderSource = { maps: { app: userMap }, mapName: 'app', model: 'User' };

export const App = () => {
  const [rule, setRule] = useState<Condition>({ all: [] });
  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 720, margin: '40px auto', display: 'grid', gap: 16 }}>
      <h1 style={{ fontSize: 18 }}>Rules Builder — example</h1>
      <RuleBuilder source={source} slots={exampleSlots} value={rule} onChange={setRule} />
      <pre style={{ background: '#f6f6f6', padding: 12, borderRadius: 8, fontSize: 12 }}>
        {JSON.stringify(rule, null, 2)}
      </pre>
    </div>
  );
};
