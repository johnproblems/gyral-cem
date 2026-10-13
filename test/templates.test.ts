import { describe, expect, it } from 'vitest';
import { analyzeInline } from './helpers.js';

describe('templates', () => {
  it('collects slots, parts, and custom properties', () => {
    const analysis = analyzeInline(`
export const Widget = define()('x-widget', {
  view: () => html\`
    <article part="card">
      <slot></slot>
      <slot name="actions"></slot>
    </article>\`,
  styles: css\`
    :host { background: var(--card-bg); color: var(--card-fg); }
  \`,
});
    `);
    expect(analysis.warnings).toEqual([]);
    const component = analysis.components[0];
    expect(component?.slots).toEqual([{ name: '' }, { name: 'actions' }]);
    expect(component?.parts).toEqual(['card']);
    expect(component?.cssProperties).toEqual([
      { name: '--card-bg', default: undefined },
      { name: '--card-fg', default: undefined },
    ]);
  });

  it('splits multi-name part attributes and reads plain-string styles', () => {
    const analysis = analyzeInline(`
export const Widget = define()('x-widget', {
  view: () => html\`<p part="title  subtitle"></p>\`,
  styles: ':host { border-color: var(--line); }',
});
    `);
    expect(analysis.components[0]?.parts).toEqual(['title', 'subtitle']);
    expect(analysis.components[0]?.cssProperties).toEqual([{ name: '--line', default: undefined }]);
  });

  it('records custom property definitions with their values', () => {
    const analysis = analyzeInline(`
export const Widget = define()('x-widget', {
  view: () => html\`<p></p>\`,
  styles: css\`
    :host { --card-bg: white; --gap: 8px; }
    p { color: var(--card-bg); }
  \`,
});
    `);
    expect(analysis.warnings).toEqual([]);
    expect(analysis.components[0]?.cssProperties).toEqual([
      { name: '--card-bg', default: 'white' },
      { name: '--gap', default: '8px' },
    ]);
  });

  it('warns on dynamic part bindings without guessing', () => {
    const analysis = analyzeInline(`
const extra = 'badge';
export const Widget = define()('x-widget', {
  view: () => html\`<article part="card"><span part=\${extra}>x</span></article>\`,
});
    `);
    expect(analysis.components[0]?.parts).toEqual(['card']);
    expect(analysis.warnings.map((w) => w.message)).toEqual([
      'Skipping a dynamic part binding (part=${…}).',
    ]);
  });

  it('warns on dynamic slot names', () => {
    const analysis = analyzeInline(`
const name = 'actions';
export const Widget = define()('x-widget', {
  view: () => html\`<slot name=\${name}></slot>\`,
});
    `);
    expect(analysis.components[0]?.slots).toEqual([]);
    expect(analysis.warnings.map((w) => w.message)).toEqual([
      'Skipping a <slot> with a dynamic name.',
    ]);
  });
});
