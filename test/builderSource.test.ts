import { describe, expect, test } from 'bun:test';
import {
  type Condition,
  createLens,
  type FieldMap,
  type LensNarrowing,
  validateRuleInLens,
} from '@inixiative/json-rules';
import { builderSource, composeNarrowed, resolve } from '../src/schema/surface';

const map: FieldMap = {
  models: {
    Fan: {
      fields: {
        email: { kind: 'scalar', type: 'String' },
        status: { kind: 'enum', type: 'FanStatus' },
        answers: { kind: 'object', type: 'Answer', isList: true },
        mission: { kind: 'object', type: 'Mission' },
      },
    },
    Answer: {
      fields: {
        text: { kind: 'scalar', type: 'String' },
        question: { kind: 'object', type: 'Question' },
      },
    },
    Question: {
      fields: {
        label: { kind: 'scalar', type: 'String' },
        mission: { kind: 'object', type: 'Mission' },
      },
    },
    Mission: {
      fields: {
        uuid: { kind: 'scalar', type: 'String' },
        name: { kind: 'scalar', type: 'String' },
      },
    },
  },
  enums: { FanStatus: ['active', 'banned', 'pending'] },
};

const lens: LensNarrowing = {
  parent: createLens({ maps: { db: map }, mapName: 'db', model: 'Fan' }),
  root: {
    picks: ['email', 'status'],
    enumPicks: { status: ['active', 'pending'] },
    relations: {
      mission: { picks: ['uuid', 'name'] },
      answers: {
        picks: ['text'],
        relations: { question: { picks: ['label'], relations: { mission: { picks: ['name'] } } } },
      },
    },
  },
};

const leaf = (field: string): Condition => ({ field, operator: 'notEmpty' });
const nested = (field: string): Condition => ({
  field: 'answers',
  arrayOperator: 'any',
  condition: leaf(field),
});

describe('builderSource', () => {
  test('gates each path as the lens does — a column one path shows is not offered on another', () => {
    const gate = composeNarrowed(builderSource(lens));
    expect(validateRuleInLens(leaf('mission.uuid'), lens).ok).toBe(true);
    expect(validateRuleInLens(leaf('mission.uuid'), gate).ok).toBe(true);
    expect(validateRuleInLens(nested('question.mission.name'), gate).ok).toBe(true);
    expect(validateRuleInLens(nested('question.mission.uuid'), lens).ok).toBe(false);
    expect(validateRuleInLens(nested('question.mission.uuid'), gate).ok).toBe(false);
  });

  test('spells the shown columns, enum values and relations per path', () => {
    expect(builderSource(lens).narrowing.root).toEqual({
      picks: ['email', 'status'],
      enumPicks: { status: ['active', 'pending'] },
      relations: {
        answers: {
          picks: ['text'],
          relations: {
            question: { picks: ['label'], relations: { mission: { picks: ['name'] } } },
          },
        },
        mission: { picks: ['uuid', 'name'] },
      },
    });
    const status: Condition = { field: 'status', operator: 'equals', value: 'banned' };
    expect(validateRuleInLens(status, composeNarrowed(builderSource(lens))).ok).toBe(false);
  });

  test('ships no clamp — the surface carries no where', () => {
    const clamped: LensNarrowing = {
      ...lens,
      root: { ...lens.root, where: { field: 'email', operator: 'equals', value: 'x' } },
    };
    expect(JSON.stringify(builderSource(clamped))).not.toContain('"where"');
  });

  test('is a RuleBuilderSource the builder resolves; fetched values ride the surface', () => {
    const source = builderSource(lens, {
      sourceValues: [
        {
          path: 'Fan.mission',
          mapName: 'db',
          model: 'Mission',
          field: 'name',
          options: [{ value: 'Launch' }],
        },
      ],
    });
    expect(source.maps.db?.models.Mission?.fields.name?.options).toEqual([{ value: 'Launch' }]);
    const view = resolve(source);
    expect(Object.keys(view.visit('Fan.answers.question.mission')?.fields ?? {})).toEqual(['name']);
  });
});
