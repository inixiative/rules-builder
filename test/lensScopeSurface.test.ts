import { describe, expect, test } from 'bun:test';
import { createLens, type FieldMap } from '@inixiative/json-rules';
import { lensScopeSurface } from '../src/schema/lensScopeSurface';

const map: FieldMap = {
  models: {
    Recipient: {
      fields: {
        email: { kind: 'scalar', type: 'String' },
        role: { kind: 'enum', type: 'UserRole' },
        tags: { kind: 'scalar', type: 'String', isList: true },
        account: { kind: 'object', type: 'Account' },
        fanMissions: { kind: 'object', type: 'FanMission', isList: true },
      },
    },
    Account: {
      fields: {
        industry: { kind: 'scalar', type: 'String' },
        owner: { kind: 'object', type: 'User' },
        // to-one back-reference: Recipient → Account → Recipient
        primaryContact: { kind: 'object', type: 'Recipient' },
        opportunities: { kind: 'object', type: 'Opportunity', isList: true },
      },
    },
    User: {
      fields: {
        name: { kind: 'scalar', type: 'String' },
        team: { kind: 'object', type: 'Team' },
        manager: { kind: 'object', type: 'User' },
      },
    },
    Team: {
      fields: {
        name: { kind: 'scalar', type: 'String' },
        region: { kind: 'object', type: 'Region' },
      },
    },
    Region: { fields: { name: { kind: 'scalar', type: 'String' } } },
    Opportunity: { fields: { amount: { kind: 'scalar', type: 'Int' } } },
    FanMission: {
      fields: {
        status: { kind: 'scalar', type: 'String' },
        recipient: { kind: 'object', type: 'Recipient' },
      },
    },
  },
  enums: { UserRole: ['admin', 'member'] },
};

const lens = createLens({ maps: { app: map }, mapName: 'app', model: 'Recipient' });

const surface = (opts = {}) => {
  const { values, loops } = lensScopeSurface(lens, opts);
  return {
    values: Object.fromEntries(values.map((o) => [o.path, o])),
    loops: Object.fromEntries(loops.map((o) => [o.path, o])),
  };
};

describe('lensScopeSurface', () => {
  test('flattens to-one chains unbounded — no depth cap to configure', () => {
    const { values } = surface();
    expect(Object.keys(values).sort()).toEqual([
      'account.industry',
      'account.owner.name',
      'account.owner.team.name',
      'account.owner.team.region.name',
      'email',
      'role',
      'tags',
    ]);
    // four relation hops, reached without asking for a depth
    expect(values['account.owner.team.region.name']).toMatchObject({
      field: 'name',
      kind: 'String',
    });
    expect(values.role).toMatchObject({ kind: 'Enum', values: ['admin', 'member'] });
  });

  test('a to-many relation becomes a loop portal and its subtree is not flattened', () => {
    const { values, loops } = surface();
    expect(loops.fanMissions).toEqual({
      path: 'fanMissions',
      field: 'fanMissions',
      label: 'fanMissions',
      relation: { mapName: 'app', modelName: 'FanMission' },
    });
    expect(values['fanMissions.status']).toBeUndefined();
    expect(Object.keys(values).some((p) => p.startsWith('fanMissions.'))).toBe(false);
  });

  test('a to-many under a to-one prefix is a portal at its dotted path', () => {
    const { loops } = surface();
    expect(loops['account.opportunities']).toMatchObject({
      field: 'opportunities',
      relation: { mapName: 'app', modelName: 'Opportunity' },
    });
    expect(Object.keys(loops).sort()).toEqual(['account.opportunities', 'fanMissions']);
  });

  test('cycles terminate — a model already on the path is cut', () => {
    const { values } = surface();
    // Recipient → Account → Recipient
    expect(Object.keys(values).some((p) => p.startsWith('account.primaryContact'))).toBe(false);
    // User → User
    expect(Object.keys(values).some((p) => p.includes('.manager'))).toBe(false);
  });

  test('re-anchoring at a loop element model yields that scope, portals included', () => {
    const { relation } = surface().loops.fanMissions;
    const { values, loops } = surface({ mapName: relation.mapName, model: relation.modelName });
    // paths are relative to the loop binding, not the outer anchor
    expect(Object.keys(values).sort()).toEqual([
      'recipient.account.industry',
      'recipient.account.owner.name',
      'recipient.account.owner.team.name',
      'recipient.account.owner.team.region.name',
      'recipient.email',
      'recipient.role',
      'recipient.tags',
      'status',
    ]);
    expect(Object.keys(loops).sort()).toEqual([
      'recipient.account.opportunities',
      'recipient.fanMissions',
    ]);
  });

  test('a scalar list column stays a value, flagged isList', () => {
    const { values, loops } = surface();
    expect(values.tags).toMatchObject({ field: 'tags', kind: 'String', isList: true });
    expect(loops.tags).toBeUndefined();
    expect(values.email.isList).toBe(false);
  });

  test('labels override by path, for values and loops alike', () => {
    const { values, loops } = surface({
      labels: {
        'account.owner.name': 'Account owner',
        'account.opportunities': 'Opportunities',
      },
    });
    expect(values['account.owner.name'].label).toBe('Account owner');
    expect(loops['account.opportunities'].label).toBe('Opportunities');
    expect(loops.fanMissions.label).toBe('fanMissions');
  });
});
