import type { Bridge, FieldMap } from '@inixiative/json-rules';
import type { SavedLens, SavedNarrowing, Workspace } from './workspace';
import { emptyWorkspace } from './workspace';

/** Two sources so bridges connect across maps and sources have somewhere to land. */
export const sampleMaps: Record<string, FieldMap> = {
  app: {
    models: {
      User: {
        fields: {
          id: { kind: 'scalar', type: 'Int' },
          email: { kind: 'scalar', type: 'String' },
          age: { kind: 'scalar', type: 'Int' },
          role: { kind: 'enum', type: 'UserRole' },
          tier: { kind: 'scalar', type: 'String' }, // sourced → pseudo-enum
          active: { kind: 'scalar', type: 'Boolean' },
          metadata: { kind: 'scalar', type: 'Json' }, // freeform sub-path (metadata.theme)
          createdAt: { kind: 'scalar', type: 'DateTime' },
          accountId: { kind: 'scalar', type: 'Int' },
          orders: { kind: 'object', type: 'Order', isList: true },
        },
      },
      Order: {
        fields: {
          id: { kind: 'scalar', type: 'Int' },
          total: { kind: 'scalar', type: 'Float' },
          status: { kind: 'enum', type: 'OrderStatus' },
          placedAt: { kind: 'scalar', type: 'DateTime' },
          userId: { kind: 'scalar', type: 'Int' },
        },
      },
    },
    enums: {
      UserRole: ['admin', 'member', 'guest'],
      OrderStatus: ['pending', 'paid', 'shipped', 'canceled'],
    },
  },
  crm: {
    models: {
      Account: {
        fields: {
          id: { kind: 'scalar', type: 'Int' },
          name: { kind: 'scalar', type: 'String' },
          industry: { kind: 'scalar', type: 'String' }, // sourced → pseudo-enum
          tier: { kind: 'enum', type: 'AccountTier' },
          ownerEmail: { kind: 'scalar', type: 'String' },
        },
      },
      Contact: {
        fields: {
          id: { kind: 'scalar', type: 'Int' },
          email: { kind: 'scalar', type: 'String' },
          accountId: { kind: 'scalar', type: 'Int' },
        },
      },
    },
    enums: { AccountTier: ['smb', 'mid', 'enterprise'] },
  },
};

/** One Account (the "one") fans out to many app Users (the "many"). */
export const sampleBridges: Bridge[] = [
  {
    endpoints: [
      { fieldMap: 'crm', model: 'Account', on: 'id' },
      { fieldMap: 'app', model: 'User', on: 'accountId' },
    ],
    cardinality: 'oneToMany',
  },
];

/**
 * Stand-in for the DB: rows per model. A source's options are the DISTINCT
 * values of its column across these rows (after the eligibility `where`), so a
 * field's option set is its own data — the pseudo-enum.
 */
export const sampleRows: Record<string, Record<string, unknown>[]> = {
  User: [
    { id: 1, tier: 'gold', active: true },
    { id: 2, tier: 'silver', active: true },
    { id: 3, tier: 'silver', active: true }, // duplicate → distinct
    { id: 4, tier: 'bronze', active: false }, // dropped by where (active = true)
    { id: 5, tier: 'platinum', active: false }, // dropped by where
  ],
  Account: [
    { id: 1, industry: 'tech' },
    { id: 2, industry: 'finance' },
    { id: 3, industry: 'health' },
    { id: 4, industry: 'tech' }, // duplicate → distinct
  ],
};

/** A cross-map lens: anchored at app.User with the bridge attached, so app + crm are both reachable. */
export const sampleLenses: Record<string, SavedLens> = {
  'app-users': { mapName: 'app', model: 'User', maps: ['app', 'crm'], bridges: sampleBridges },
};

/** Two narrowings: one off the lens, one chained off that narrowing — each only restricts further. */
export const sampleNarrowings: Record<string, SavedNarrowing> = {
  'vip-active': {
    parent: { kind: 'lens', name: 'app-users' },
    narrowing: {
      root: {
        picks: ['id', 'email', 'tier', 'role', 'active', 'metadata'],
        where: { all: [{ field: 'active', operator: 'equals', value: true }] },
        enumPicks: { role: ['admin', 'member'] },
        sources: { tier: { all: [{ field: 'active', operator: 'equals', value: true }] } },
      },
      mapDefaults: {
        crm: {
          models: { Account: { picks: ['id', 'name', 'industry', 'tier'], sources: { industry: { all: [] } } } },
        },
      },
    },
  },
  'admins-only': {
    parent: { kind: 'narrowing', name: 'vip-active' },
    narrowing: { root: { enumPicks: { role: ['admin'] } } },
  },
};

/** A rebac entry on User: a terminal deny, an rbac delegation, and an any[self, abac]. */
export const samplePermissions: Workspace['permissions'] = {
  'app:User': {
    actions: {
      own: null,
      manage: 'own',
      read: {
        any: [{ self: 'id' }, { rule: { all: [{ field: 'active', operator: 'equals', value: true }] } }, 'manage'],
      },
    },
  },
};

/** A lifecycle transition on app:Order: pending → paid, guarded by a positive total. */
export const sampleTransitions: Workspace['transitions'] = {
  'app:Order': {
    capturePayment: {
      paths: [
        {
          from: {
            predicate: {
              all: [
                { field: 'status', operator: 'equals', value: 'pending' },
                { field: 'total', operator: 'greaterThan', value: 0 },
              ],
            },
          },
          to: { predicate: { all: [{ field: 'status', operator: 'equals', value: 'paid' }] } },
        },
      ],
    },
  },
};

export const defaultWorkspace = (): Workspace => ({
  ...emptyWorkspace(),
  maps: sampleMaps,
  bridges: sampleBridges,
  lenses: sampleLenses,
  narrowings: sampleNarrowings,
  permissions: samplePermissions,
  transitions: sampleTransitions,
});
