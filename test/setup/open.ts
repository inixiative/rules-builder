import {
  type LensView,
  type RuleBuilderSource,
  resolve,
  withAllRelations,
} from '../../src/schema/surface';

/** A fixture's whole schema, every relation turned on (each edge once per path). */
export const openView = (source: RuleBuilderSource): LensView => resolve(withAllRelations(source));
