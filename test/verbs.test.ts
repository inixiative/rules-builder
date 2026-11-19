import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as api from '../src/index';

const doc = readFileSync(join(import.meta.dir, '..', 'docs/VERBS.md'), 'utf8');
const exported = Object.keys(api).filter(
  (name) => typeof (api as Record<string, unknown>)[name] === 'function',
);

describe('docs/VERBS.md', () => {
  test('every exported function is in the verb catalog', () => {
    expect(exported.filter((name) => !doc.includes(`\`${name}\``))).toEqual([]);
  });
});
