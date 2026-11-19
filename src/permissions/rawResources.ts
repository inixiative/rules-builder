import { type FieldMap, modelOf } from '@inixiative/field-map';
import type { Bridge } from '@inixiative/json-rules';
import { type LensView, rawView } from '../schema/surface';

/** `map:model` → its map and model (a bare model sits in the unnamed map). */
export const splitResource = (resource: string): [string, string] => {
  const i = resource.indexOf(':');
  return i === -1 ? ['', resource] : [resource.slice(0, i), resource.slice(i + 1)];
};

/** The reserved key permissions puts who is acting under, for every `{ rule }` (untyped until
 *  the actor bridge lands; TRACKING "Actor bridge"). */
export const ACTOR_FIELD = '__actor';

// Every model carries `__actor` as Json, as permissions injects it into each record a `{ rule }`
// reads, so a rule that reads the actor is authored and validated in the same view.
const withActor = (maps: Record<string, FieldMap>): Record<string, FieldMap> =>
  Object.fromEntries(
    Object.entries(maps).map(([name, map]) => [
      name,
      {
        ...map,
        models: Object.fromEntries(
          Object.entries(map.models).map(([model, entry]) => [
            model,
            {
              ...entry,
              fields: { ...entry.fields, [ACTOR_FIELD]: { kind: 'scalar', type: 'Json' } },
            },
          ]),
        ),
      },
    ]),
  );

/** The raw-record views a permission or transition is authored in: one per resource, every
 *  column and relation shown, `__actor` beside them. Undefined for a resource the maps lack. */
export const rawResourceViews = (maps: Record<string, FieldMap>, bridges: Bridge[] | undefined) => {
  const withActorMaps = withActor(maps);
  const views = new Map<string, LensView | undefined>();
  return (resource: string): LensView | undefined => {
    if (!views.has(resource)) {
      const [mapName, model] = splitResource(resource);
      views.set(
        resource,
        modelOf(maps[mapName], model)
          ? rawView({ maps: withActorMaps, bridges, mapName, model })
          : undefined,
      );
    }
    return views.get(resource);
  };
};

/** The list relations of a resource that a list arm may cross: those its map declares
 *  `/// @permissions(down: […])`, as permissions only crosses a declared list. */
export const declaredListRelations =
  (maps: Record<string, FieldMap>) =>
  (resource: string): string[] => {
    const [mapName, model] = splitResource(resource);
    return Object.entries(modelOf(maps[mapName], model)?.fields ?? {})
      .filter(
        ([, field]) =>
          field.kind === 'object' &&
          field.isList === true &&
          field.annotations?.permissions?.down !== undefined,
      )
      .map(([name]) => name);
  };
