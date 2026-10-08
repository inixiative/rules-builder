import { describe, expect, test } from 'bun:test';
import type { FieldMap } from '@inixiative/json-rules';
import { lensScopeSurface } from '../src/schema/lensScopeSurface';
import { composeNarrowed, withAllRelations } from '../src/schema/surface';

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

const source = { maps: { app: map }, mapName: 'app', model: 'Recipient' };
// What an app spells: the account chain and the fan-mission loop, with the same chain
// below the loop's recipient.
const accountChain = {
  relations: {
    owner: { relations: { team: { relations: { region: {} } } } },
    opportunities: {},
  },
};
const lens = composeNarrowed({
  ...source,
  narrowing: {
    root: {
      relations: {
        account: accountChain,
        fanMissions: { relations: { recipient: { relations: { account: accountChain } } } },
      },
    },
  },
});

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
      at: 'fanMissions',
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

  test('the model defaults grow a tree — each model once, at its nearest reach', () => {
    const open = lensScopeSurface(composeNarrowed(withAllRelations(source)));
    // User is reached at account.owner, so neither its manager (User again) nor the
    // Recipient behind account.primaryContact (the anchor's own model) is reached again.
    expect(open.values.map((o) => o.path).sort()).toEqual([
      'account.industry',
      'account.owner.name',
      'account.owner.team.name',
      'account.owner.team.region.name',
      'email',
      'role',
      'tags',
    ]);
    expect(open.loops.map((o) => o.path).sort()).toEqual(['account.opportunities', 'fanMissions']);
    // A second reach is spelled.
    const spelled = lensScopeSurface(
      composeNarrowed({
        ...source,
        narrowing: {
          root: {
            relations: { account: { relations: { owner: { relations: { manager: {} } } } } },
          },
        },
      }),
    );
    expect(spelled.values.map((o) => o.path)).toContain('account.owner.manager.name');
  });

  test('a model a spelled path leaves is not followed back', () => {
    const { values } = surface();
    expect(Object.keys(values).some((p) => p.startsWith('account.primaryContact'))).toBe(false);
    expect(Object.keys(values).some((p) => p.includes('.manager'))).toBe(false);
  });

  test('re-anchoring at a loop yields the visit the lens shows there, portals included', () => {
    const { at } = surface().loops.fanMissions;
    const { values, loops } = surface({ at });
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
    // Recipient.fanMissions was crossed to get here: a model-default edge is crossed once per
    // path, so the loop does not reopen itself.
    expect(Object.keys(loops).sort()).toEqual(['recipient.account.opportunities']);
    expect(loops['recipient.account.opportunities'].at).toBe(
      'fanMissions.recipient.account.opportunities',
    );
  });

  test('a relation the lens does not turn on is neither a value nor a loop', () => {
    const { values, loops } = lensScopeSurface(composeNarrowed(source));
    expect(values.map((o) => o.path).sort()).toEqual(['email', 'role', 'tags']);
    expect(loops).toEqual([]);
    const onlyAccount = lensScopeSurface(
      composeNarrowed({ ...source, narrowing: { root: { relations: { account: {} } } } }),
    );
    expect(onlyAccount.values.map((o) => o.path).sort()).toEqual([
      'account.industry',
      'email',
      'role',
      'tags',
    ]);
    expect(onlyAccount.loops).toEqual([]);
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
