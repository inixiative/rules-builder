import { react } from '@inixiative/config/tsup';

export default react({
  entry: {
    index: 'src/index.ts',
    'schema/index': 'src/schema/index.ts',
  },
  external: ['@inixiative/json-rules'],
});
