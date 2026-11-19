import { react } from '@inixiative/config/tsup';

export default react({
  entry: {
    index: 'src/index.ts',
    'schema/index': 'src/schema/index.ts',
    'permissions/index': 'src/permissions/index.ts',
  },
  external: ['@inixiative/json-rules', '@inixiative/permissions'],
});
