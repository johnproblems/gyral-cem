import { describe, expect, it } from 'vitest';
import { analyzeInline } from './helpers.js';

describe('outputs', () => {
  it('emits one entry per _tag of the output union', () => {
    const analysis = analyzeInline(`
export type Out =
  | { readonly _tag: 'Added'; readonly sku: string }
  | { readonly _tag: 'Removed'; readonly sku: string };
export const Widget = define<unknown, never, object, Out>()('x-widget', {
  view: () => html\`<p></p>\`,
});
    `);
    expect(analysis.warnings).toEqual([]);
    expect(analysis.components[0]?.outputs).toEqual([
      { tag: 'Added', payloadText: '{ readonly _tag: "Added"; readonly sku: string; }' },
      { tag: 'Removed', payloadText: '{ readonly _tag: "Removed"; readonly sku: string; }' },
    ]);
  });

  it('handles a single-member output', () => {
    const analysis = analyzeInline(`
export type Out = { readonly _tag: 'Changed'; readonly value: string };
export const Widget = define<unknown, never, object, Out>()('x-widget', {
  view: () => html\`<p></p>\`,
});
    `);
    expect(analysis.components[0]?.outputs).toEqual([
      { tag: 'Changed', payloadText: '{ readonly _tag: "Changed"; readonly value: string; }' },
    ]);
  });

  it('reports no outputs without a 4th generic', () => {
    const analysis = analyzeInline(`
export const Widget = define<unknown, never>()('x-widget', {
  view: () => html\`<p></p>\`,
});
    `);
    expect(analysis.components[0]?.outputs).toEqual([]);
    expect(analysis.warnings).toEqual([]);
  });

  it('warns on members without a string-literal _tag', () => {
    const analysis = analyzeInline(`
export type Out = { readonly _tag: string; readonly value: string };
export const Widget = define<unknown, never, object, Out>()('x-widget', {
  view: () => html\`<p></p>\`,
});
    `);
    expect(analysis.components[0]?.outputs).toEqual([]);
    expect(analysis.warnings).toHaveLength(1);
    expect(analysis.warnings[0]?.message).toMatch(/without a string-literal _tag/);
  });
});
