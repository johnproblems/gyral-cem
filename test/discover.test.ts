import { describe, expect, it } from 'vitest';
import { analyzeInline, fixtureDir } from './helpers.js';
import { analyze } from '../src/analyze.js';
import { join } from 'node:path';

describe('discovery', () => {
  it('finds zero-arg define() calls with no outputs', () => {
    const analysis = analyzeInline(`
export const Badge = define()('x-badge', { view: () => html\`<p></p>\` });
    `);
    expect(analysis.components.map((c) => [c.tag, c.exportName])).toEqual([['x-badge', 'Badge']]);
    expect(analysis.components[0]?.outputs).toEqual([]);
  });

  it('ignores customElements.define and non-component calls', () => {
    const dir = fixtureDir({
      'widget.ts': `
import { define, html } from './stub.js';
class El extends HTMLElement {}
customElements.define('x-native', El);
define('not-a-component');
export const Widget = define()('x-widget', { view: () => html\`<p></p>\` });
      `,
    });
    const analysis = analyze({ root: dir, files: [join(dir, 'widget.ts'), join(dir, 'stub.ts')] });
    expect(analysis.components.map((c) => c.tag)).toEqual(['x-widget']);
  });

  it('records undefined export names for unexported components', () => {
    const analysis = analyzeInline(`
const Hidden = define()('x-hidden', { view: () => html\`<p></p>\` });
    `);
    expect(analysis.components.map((c) => [c.tag, c.exportName])).toEqual([['x-hidden', undefined]]);
  });

  it('follows an aliased define import', () => {
    const dir = fixtureDir({
      'widget.ts': `
import { define as d, html } from './stub.js';
export const Widget = d()('x-widget', { view: () => html\`<p></p>\` });
      `,
    });
    const analysis = analyze({ root: dir, files: [join(dir, 'widget.ts'), join(dir, 'stub.ts')] });
    expect(analysis.components.map((c) => [c.tag, c.exportName])).toEqual([['x-widget', 'Widget']]);
  });

  it('accepts namespace calls but never customElements.define', () => {
    const dir = fixtureDir({
      'widget.ts': `
import { html } from './stub.js';
import * as gyral from './stub.js';
class El extends HTMLElement {}
customElements.define('x-native', El);
export const Widget = gyral.define()('x-widget', { view: () => html\`<p></p>\` });
      `,
    });
    const analysis = analyze({ root: dir, files: [join(dir, 'widget.ts'), join(dir, 'stub.ts')] });
    expect(analysis.components.map((c) => c.tag)).toEqual(['x-widget']);
  });

  it('reads export defaults and export lists', () => {
    const dir = fixtureDir({
      'widget.ts': `
import { define, html } from './stub.js';
export default define()('x-first', { view: () => html\`<p></p>\` });
const Second = define()('x-second', { view: () => html\`<p></p>\` });
export { Second as Renamed };
      `,
    });
    const analysis = analyze({ root: dir, files: [join(dir, 'widget.ts'), join(dir, 'stub.ts')] });
    expect(analysis.components.map((c) => [c.tag, c.exportName]).sort()).toEqual([
      ['x-first', 'default'],
      ['x-second', 'Renamed'],
    ]);
  });

  it('warns on duplicate tags across files', () => {
    const dir = fixtureDir({
      'a.ts': `
import { define, html } from './stub.js';
export const A = define()('x-dup', { view: () => html\`<p></p>\` });
      `,
      'b.ts': `
import { define, html } from './stub.js';
export const B = define()('x-dup', { view: () => html\`<p></p>\` });
      `,
    });
    const analysis = analyze({ root: dir, files: [join(dir, 'a.ts'), join(dir, 'b.ts'), join(dir, 'stub.ts')] });
    expect(analysis.components).toHaveLength(2);
    expect(analysis.warnings.map((w) => w.message)).toEqual([
      `Duplicate tag "x-dup" (also defined in ${join(dir, 'a.ts')}).`,
    ]);
  });
});
