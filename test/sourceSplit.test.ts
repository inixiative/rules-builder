import { describe, expect, test } from 'bun:test';
import {
  type Condition,
  check,
  createLens,
  exposedSurface,
  type FieldMap,
} from '@inixiative/json-rules';
import {
  type Decoration,
  describeFacets,
  matchFacet,
  validateDecoration,
} from '../src/schema/decoration';

// One physical enrichment table split into two logical sources by a system slug —
// "Salesforce custom fields" vs "Gong custom fields" — authored by hand, no new
// primitive: each is a facet whose fixed `where` leads with the slug.
const map: FieldMap = {
  models: {
    User: { fields: { customFields: { kind: 'object', type: 'CustomField', isList: true } } },
    CustomField: {
      fields: {
        slug: { kind: 'scalar', type: 'String' }, // the system slug / integration source
        key: { kind: 'scalar', type: 'String' },
        value: { kind: 'scalar', type: 'String' },
      },
    },
  },
};
const lens = exposedSurface(createLens({ maps: { app: map }, mapName: 'app', model: 'User' }));

const npsFacet = (slug: string, label: string): Decoration['facets'][number] => ({
  path: 'customFields.value',
  where: {
    all: [
      { field: 'slug', operator: 'equals', value: slug },
      { field: 'key', operator: 'equals', value: 'nps' },
    ],
  },
  kind: 'Int',
  label,
});

const decoration: Decoration = {
  facets: [npsFacet('salesforce', 'Salesforce NPS'), npsFacet('gong', 'Gong NPS')],
};

describe('splitting one enrichment table into logical sources by a system slug (manual)', () => {
  test('the two sources are collision-free and both offered', () => {
    expect(validateDecoration(lens, decoration)).toEqual([]);
    const labels = describeFacets(lens, decoration).map((f) => f.label);
    expect(labels).toContain('Salesforce NPS');
    expect(labels).toContain('Gong NPS');
  });

  test('a source facet seeds the slug + key as leading conditions and evaluates on its own rows', () => {
    const [sf] = describeFacets(lens, decoration);
    const seed = sf.seed as { field: string; condition: { all: Condition[] } };
    expect(seed.condition.all[0]).toMatchObject({ field: 'slug', value: 'salesforce' });
    expect(seed.condition.all[1]).toMatchObject({ field: 'key', value: 'nps' });

    const rule = {
      ...(sf.seed as object),
      condition: {
        all: [
          seed.condition.all[0],
          seed.condition.all[1],
          { field: 'value', operator: 'greaterThan', value: 5 },
        ],
      },
    } as Condition;
    // a Salesforce nps row > 5 matches; the identical Gong row does not (wrong source).
    expect(check(rule, { customFields: [{ slug: 'salesforce', key: 'nps', value: 9 }] })).toBe(
      true,
    );
    expect(check(rule, { customFields: [{ slug: 'gong', key: 'nps', value: 9 }] })).not.toBe(true);
  });

  test('rehydration keeps the two sources distinct', () => {
    const sfNode = {
      field: 'customFields',
      arrayOperator: 'any',
      condition: {
        all: [
          { field: 'slug', operator: 'equals', value: 'salesforce' },
          { field: 'key', operator: 'equals', value: 'nps' },
          { field: 'value', operator: 'greaterThan', value: 5 },
        ],
      },
    } as Condition;
    const gongNode = {
      field: 'customFields',
      arrayOperator: 'any',
      condition: {
        all: [
          { field: 'slug', operator: 'equals', value: 'gong' },
          { field: 'key', operator: 'equals', value: 'nps' },
          { field: 'value', operator: 'greaterThan', value: 5 },
        ],
      },
    } as Condition;
    expect(matchFacet(lens, decoration, sfNode)?.label).toBe('Salesforce NPS');
    expect(matchFacet(lens, decoration, gongNode)?.label).toBe('Gong NPS');
  });
});
