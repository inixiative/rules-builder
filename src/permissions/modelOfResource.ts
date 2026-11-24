import { modelOf, own } from '@inixiative/field-map';
import { parseEndpointKey } from '@inixiative/json-rules';
import type { SchemaMap } from '@inixiative/permissions';

/** The map and model a resource (`map:Model`) names among the schema map's `maps`, or null. */
export const modelOfResource = (map: SchemaMap, resource: string) => {
  const { mapName, modelName } = parseEndpointKey(resource, '');
  const fieldMap = own(map.maps, mapName);
  return fieldMap && modelOf(fieldMap, modelName) ? { mapName, modelName } : null;
};
