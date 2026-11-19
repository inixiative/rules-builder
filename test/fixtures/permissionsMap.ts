import type { SchemaMap } from '@inixiative/permissions';
import type { RebacSchema } from '../../src/permissions/types';

/** permissions' schema map for the permission-builder tests: a user in an organization in a
 *  region, with a declared list of drafts and an undeclared list of posts. */
export const permissionsMap: SchemaMap = {
  resources: {
    'app:User': 'User',
    'app:Organization': 'Organization',
    'app:Region': 'Region',
    'app:Post': 'Post',
  },
  fieldMap: {
    models: {
      User: {
        fields: {
          id: { kind: 'scalar', type: 'String', isId: true },
          role: { kind: 'enum', type: 'Role' },
          organizationId: { kind: 'scalar', type: 'String' },
          organization: {
            kind: 'object',
            type: 'Organization',
            relationName: 'UserOrganization',
            fromFields: ['organizationId'],
            toFields: ['id'],
          },
          posts: { kind: 'object', type: 'Post', isList: true, relationName: 'UserPosts' },
          drafts: {
            kind: 'object',
            type: 'Post',
            isList: true,
            relationName: 'UserDrafts',
            annotations: { permissions: { down: ['owner'] } },
          },
        },
      },
      Organization: {
        fields: {
          id: { kind: 'scalar', type: 'String', isId: true },
          name: { kind: 'scalar', type: 'String' },
          parentId: { kind: 'scalar', type: 'String' },
          parent: {
            kind: 'object',
            type: 'Organization',
            relationName: 'OrganizationTree',
            fromFields: ['parentId'],
            toFields: ['id'],
          },
          children: {
            kind: 'object',
            type: 'Organization',
            isList: true,
            relationName: 'OrganizationTree',
          },
          regionId: { kind: 'scalar', type: 'String' },
          region: {
            kind: 'object',
            type: 'Region',
            relationName: 'OrganizationRegion',
            fromFields: ['regionId'],
            toFields: ['id'],
          },
          users: { kind: 'object', type: 'User', isList: true, relationName: 'UserOrganization' },
        },
      },
      Region: {
        fields: {
          id: { kind: 'scalar', type: 'String', isId: true },
          code: { kind: 'scalar', type: 'String' },
          organizations: {
            kind: 'object',
            type: 'Organization',
            isList: true,
            relationName: 'OrganizationRegion',
          },
        },
      },
      Post: {
        fields: {
          id: { kind: 'scalar', type: 'String', isId: true },
          title: { kind: 'scalar', type: 'String' },
          ownerId: { kind: 'scalar', type: 'String' },
          owner: {
            kind: 'object',
            type: 'User',
            relationName: 'UserPosts',
            fromFields: ['ownerId'],
            toFields: ['id'],
          },
          authorId: { kind: 'scalar', type: 'String' },
          author: {
            kind: 'object',
            type: 'User',
            relationName: 'UserDrafts',
            fromFields: ['authorId'],
            toFields: ['id'],
          },
        },
      },
    },
    enums: { Role: ['owner', 'admin', 'member'] },
  },
};

export const permissionsSchema: RebacSchema = {
  permissions: {
    'app:User': { actions: { own: true, manage: 'own', read: 'manage' } },
    'app:Organization': { actions: { own: true, manage: 'own', read: 'manage' } },
    'app:Region': { actions: { read: true } },
    'app:Post': { actions: { read: true, edit: 'read' } },
  },
};
