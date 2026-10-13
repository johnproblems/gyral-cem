import { describe, expect, it } from 'vitest';
import { analyzeExamples } from './helpers.js';

/**
 * The gyral-shop oracle: the shop hand-maintains a registry of its CSS parts
 * and checks it with a regex test. The generated manifest must reproduce that
 * registry exactly from source.
 */
const HAND_WRITTEN_PARTS_REGISTRY: Record<string, readonly string[]> = {
  'form-input': ['field'],
  'product-card': ['image', 'price'],
  'x-counter': [],
};

describe('shop parts oracle', () => {
  it('reproduces the hand-written parts registry exactly', () => {
    const tags = Object.keys(HAND_WRITTEN_PARTS_REGISTRY).sort();
    const generated = Object.fromEntries(
      analyzeExamples().components.map((c) => [c.tag, c.parts]),
    );
    expect(Object.keys(generated).sort()).toEqual(tags);
    for (const tag of tags) {
      expect(generated[tag]).toEqual(HAND_WRITTEN_PARTS_REGISTRY[tag]);
    }
  });
});
