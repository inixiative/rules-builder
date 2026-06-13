import { describe, expect, test } from 'bun:test';
import { createLens, exposedSurface, type FieldMap } from '@inixiative/json-rules';
import { describeModelFields, valueShapeForOperator } from '../src/schema/surface';

const map: FieldMap = {
  models: {
    User: {
      fields: {
        email: { kind: 'scalar', type: 'String' },
        age: { kind: 'scalar', type: 'Int' },
        role: { kind: 'enum', type: 'UserRole' },
        createdAt: { kind: 'scalar', type: 'DateTime' },
        posts: { kind: 'object', type: 'Post', isList: true },
      },
    },
    Post: {
      fields: {
        id: { kind: 'scalar', type: 'String' },
        title: { kind: 'scalar', type: 'String' },
      },
    },
  },
  enums: { UserRole: ['admin', 'member', 'guest'] },
};

const lens = exposedSurface(createLens({ maps: { app: map }, mapName: 'app', model: 'User' }));
const fields = (model = 'User', opts = {}) =>
  Object.fromEntries(describeModelFields(lens, 'app', model, opts).map((f) => [f.name, f]));

describe('describeModelFields — operators by kind', () => {
  test('string field offers string operators (contains/startsWith), not array ops', () => {
    const f = fields().email;
    expect(f.kind).toBe('String');
    expect(f.operators.field).toContain('contains');
    expect(f.operators.field).toContain('startsWith');
    expect(f.operators.array).toEqual([]);
  });

  test('numeric field offers ordering operators but not string ones', () => {
    const f = fields().age;
    expect(f.operators.field).toContain('lessThan');
    expect(f.operators.field).toContain('between');
    expect(f.operators.field).not.toContain('contains'); // contains is string-only
  });

  test('enum field carries narrowed values and Enum kind', () => {
    const f = fields().role;
    expect(f.kind).toBe('Enum');
    expect(f.enumValues).toEqual(['admin', 'member', 'guest']);
    expect(f.operators.field).toContain('in');
  });

  test('date field offers date operators', () => {
    const f = fields().createdAt;
    expect(f.operators.date).toContain('before');
    expect(f.operators.date).toContain('within');
  });

  test('list relation offers array operators and a relation target', () => {
    const f = fields().posts;
    expect(f.isList).toBe(true);
    expect(f.operators.array).toContain('all');
    expect(f.relation).toEqual({ mapName: 'app', modelName: 'Post' });
  });
});

describe('describeModelFields — target intersection', () => {
  test('matches is dropped when toPrisma is a required target', () => {
    const withPrisma = fields('User', { targets: ['check', 'toPrisma'] }).email;
    const checkOnly = fields('User', { targets: ['check'] }).email;
    expect(checkOnly.operators.field).toContain('matches');
    expect(withPrisma.operators.field).not.toContain('matches');
  });

  test('labels decorate field names', () => {
    const f = fields('User', { labels: { 'User.email': 'Email Address' } }).email;
    expect(f.label).toBe('Email Address');
  });
});

describe('describeModelFields — pseudo-enums and unknown types', () => {
  test('a value-bearing scalar (hydrated table) surfaces enumValues but keeps its kind', () => {
    const m: FieldMap = {
      models: {
        User: {
          fields: { tier: { kind: 'scalar', type: 'String', values: ['gold', 'silver'] } },
        },
      },
    };
    const l = exposedSurface(createLens({ maps: { app: m }, mapName: 'app', model: 'User' }));
    const f = describeModelFields(l, 'app', 'User')[0];
    expect(f.enumValues).toEqual(['gold', 'silver']); // → select in the UI
    expect(f.kind).toBe('String'); // operators still string-based
    expect(f.operators.field).toContain('contains');
  });

  test('an unknown (non-Prisma) scalar type falls back to String operators, not empty', () => {
    const m: FieldMap = {
      models: { User: { fields: { handle: { kind: 'scalar', type: 'Citext' } } } },
    };
    const l = exposedSurface(createLens({ maps: { app: m }, mapName: 'app', model: 'User' }));
    const f = describeModelFields(l, 'app', 'User')[0];
    expect(f.kind).toBe('String');
    expect(f.operators.field.length).toBeGreaterThan(0);
  });
});

describe('valueShapeForOperator drives the value slot', () => {
  test('maps operators to their value shapes', () => {
    expect(valueShapeForOperator('equals')).toBe('scalar');
    expect(valueShapeForOperator('between')).toBe('range');
    expect(valueShapeForOperator('within')).toBe('dateWindow');
    expect(valueShapeForOperator('all')).toBe('predicate');
    expect(valueShapeForOperator('isEmpty')).toBe('none');
  });
});
