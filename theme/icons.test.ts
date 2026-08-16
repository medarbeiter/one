import { describe, expect, test } from 'bun:test';
import { MEANINGS, type Meaning } from './icons';

describe('the icon vocabulary', () => {
  test('every meaning resolves to a glyph', () => {
    for (const meaning of Object.keys(MEANINGS) as Meaning[]) {
      expect(MEANINGS[meaning]).toBeDefined();
    }
  });

  test('no two meanings share a glyph pair', () => {
    // A shared glyph means two ideas look identical — the exact failure this
    // module exists to prevent.
    const seen = new Map<string, string>();
    for (const [meaning, pair] of Object.entries(MEANINGS)) {
      const key = `${pair.solid.displayName ?? pair.solid.name}`;
      const prior = seen.get(key);
      expect(prior, `${meaning} reuses the glyph of ${prior}`).toBeUndefined();
      seen.set(key, meaning);
    }
  });
});
