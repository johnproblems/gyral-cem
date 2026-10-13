import { describe, expect, it } from 'vitest';
import { analyzeInline } from './helpers.js';

describe('JSDoc', () => {
  it('splits component docs into summary and description', () => {
    const analysis = analyzeInline(`
/**
 * The shop card.
 *
 * Renders a product with actions.
 */
export const Widget = define()('x-widget', { view: () => html\`<p></p>\` });
    `);
    expect(analysis.components[0]?.summary).toBe('The shop card.');
    expect(analysis.components[0]?.description).toBe('Renders a product with actions.');
  });

  it('reads prop docs and @deprecated tags', () => {
    const analysis = analyzeInline(`
export const Widget = define()('x-widget', {
  props: {
    /** Stock-keeping unit. */
    sku: prop.string({ required: true }),
    /** @deprecated Use sku instead. */
    code: prop.string(),
  },
  view: () => html\`<p></p>\`,
});
    `);
    const docs = Object.fromEntries(
      (analysis.components[0]?.props ?? []).map((p) => [p.name, [p.summary, p.deprecated]]),
    );
    expect(docs).toEqual({
      sku: ['Stock-keeping unit.', undefined],
      code: [undefined, 'Use sku instead.'],
    });
  });

  it('reads output member docs from named types', () => {
    const analysis = analyzeInline(`
/** Fired when the count changes. */
export interface Changed {
  readonly _tag: 'Changed';
  readonly count: number;
}
export const Widget = define<unknown, never, object, Changed>()('x-widget', {
  view: () => html\`<p></p>\`,
});
    `);
    expect(analysis.components[0]?.outputs).toEqual([
      {
        tag: 'Changed',
        payloadText: '{ readonly _tag: "Changed"; readonly count: number; }',
        description: 'Fired when the count changes.',
      },
    ]);
  });

  it('leaves docs undefined when no comments exist', () => {
    const analysis = analyzeInline(`
export const Widget = define()('x-widget', {
  props: { label: prop.string() },
  view: () => html\`<p></p>\`,
});
    `);
    expect(analysis.components[0]?.summary).toBeUndefined();
    expect(analysis.components[0]?.props[0]?.summary).toBeUndefined();
  });
});
