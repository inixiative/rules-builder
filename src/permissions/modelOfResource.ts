import { modelOf, own } from '@inixiative/field-map';
import { parseEndpointKey } from '@inixiative/json-rules';
import { type SchemaMap, suppliedMapNamesOf } from '@inixiative/permissions';

/** The map and model a resource (`map:Model`) names among the schema map's field maps of records, or null: a model of a supplied map is no resource. */
export const modelOfResource = (schemaMap: SchemaMap, resource: string) => {
  const { mapName, modelName } = parseEndpointKey(resource, '');
  if (suppliedMapNamesOf(schemaMap).has(mapName)) return null;
  const fieldMap = own(schemaMap.fieldMaps, mapName);
  return fieldMap && modelOf(fieldMap, modelName) ? { mapName, modelName } : null;
};
