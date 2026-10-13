import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/analyze.js';
import { analyzeInline, fixtureDir } from './helpers.js';

const setup = (props: string) => analyzeInline(`
export const Widget = define<unknown, never, object, never>()('x-widget', {
  props: { ${props} },
  view: () => html\`<p></p>\`,
});
`);

describe('props', () => {
  it('reads every builder with kebab-case attributes by default', () => {
    const analysis = setup(`
      label: prop.string({ required: true }),
      maxPrice: prop.number({ default: 10 }),
      featured: prop.boolean(),
      tags: prop.json((u: unknown): u is string[] => Array.isArray(u)),
      item: prop.value((u: unknown): u is { readonly id: number } => true),
    `);
    expect(analysis.warnings).toEqual([]);
    const component = analysis.components[0];
    expect(component?.tag).toBe('x-widget');
    expect(component?.props.map((p) => [p.name, p.builder, p.attribute, p.reflects])).toEqual([
      ['label', 'string', 'label', true],
      ['maxPrice', 'number', 'max-price', true],
      ['featured', 'boolean', 'featured', true],
      ['tags', 'json', 'tags', true],
      ['item', 'value', undefined, false],
    ]);
  });

  it('resolves value types through the checker', () => {
    const analysis = setup(`
      label: prop.string({ required: true }),
      maxPrice: prop.number({ default: 10 }),
      featured: prop.boolean(),
      tags: prop.json((u: unknown): u is string[] => Array.isArray(u)),
      item: prop.value((u: unknown): u is { readonly id: number } => true),
    `);
    const types = Object.fromEntries(
      (analysis.components[0]?.props ?? []).map((p) => [p.name, p.typeText]),
    );
    expect(types).toEqual({
      label: 'string',
      maxPrice: 'number',
      featured: 'boolean',
      tags: 'string[]',
      item: '{ readonly id: number; }',
    });
  });

  it('tracks required and default, including the implied boolean default', () => {
    const analysis = setup(`
      label: prop.string({ required: true }),
      maxPrice: prop.number({ default: 10 }),
      featured: prop.boolean(),
    `);
    const flags = Object.fromEntries(
      (analysis.components[0]?.props ?? []).map((p) => [p.name, [p.required, p.defaultText]]),
    );
    expect(flags).toEqual({
      label: [true, undefined],
      maxPrice: [false, '10'],
      featured: [false, 'false'],
    });
  });

  it('honors explicit attribute names and property-only attributes', () => {
    const analysis = setup(`
      title: prop.string({ attribute: 'card-title' }),
      internal: prop.string({ attribute: false }),
    `);
    expect(analysis.components[0]?.props.map((p) => [p.name, p.attribute, p.reflects])).toEqual([
      ['title', 'card-title', true],
      ['internal', undefined, false],
    ]);
  });

  it('warns on props without a builder instead of guessing', () => {
    const analysis = setup(`label: 'nope' as unknown as never,`);
    expect(analysis.components[0]?.props).toEqual([]);
    expect(analysis.warnings.map((w) => w.message)).toEqual([
      'Prop "label" is not declared with a prop.* builder; skipped.',
    ]);
  });

  it('finds no props when the table is absent', () => {
    const analysis = analyzeInline(`
export const Plain = define()('x-plain', { view: () => html\`<p></p>\` });
    `);
    expect(analysis.components[0]?.props).toEqual([]);
    expect(analysis.warnings).toEqual([]);
  });

  it('follows an aliased prop import', () => {
    const dir = fixtureDir({
      'widget.ts': `
import { define, html } from './stub.js';
import { prop as p } from './stub.js';
export const Widget = define()('x-widget', {
  props: { label: p.string({ required: true }) },
  view: () => html\`<p></p>\`,
});
      `,
    });
    const analysis = analyze({ root: dir, files: [join(dir, 'widget.ts'), join(dir, 'stub.ts')] });
    expect(analysis.components[0]?.props.map((p) => [p.name, p.builder])).toEqual([
      ['label', 'string'],
    ]);
  });

  it('resolves template-literal attributes and warns on dynamic ones', () => {
    const analysis = setup(`
      fixed: prop.string({ attribute: \`card-title\` }),
      loose: prop.string({ attribute: 'x-' + 'y' }),
    `);
    expect(analysis.components[0]?.props.map((p) => [p.name, p.attribute])).toEqual([
      ['fixed', 'card-title'],
      ['loose', 'loose'],
    ]);
    expect(analysis.warnings.map((w) => w.message)).toEqual([
      'Prop "loose" has a dynamic attribute expression; assuming "loose".',
    ]);
  });

  it('follows an identifier props table', () => {
    const analysis = analyzeInline(`
const shared = { label: prop.string({ required: true }) };
export const Widget = define()('x-widget', {
  props: shared,
  view: () => html\`<p></p>\`,
});
    `);
    expect(analysis.warnings).toEqual([]);
    expect(analysis.components[0]?.props.map((p) => p.name)).toEqual(['label']);
  });

  it('inlines resolvable spreads with later entries winning', () => {
    const analysis = analyzeInline(`
const shared = { label: prop.string(), count: prop.number() };
export const Widget = define()('x-widget', {
  props: { ...shared, label: prop.string({ required: true }) },
  view: () => html\`<p></p>\`,
});
    `);
    expect(analysis.warnings).toEqual([]);
    expect(analysis.components[0]?.props.map((p) => [p.name, p.required])).toEqual([
      ['label', true],
      ['count', false],
    ]);
  });

  it('warns on unresolvable spreads and tables', () => {
    const analysis = analyzeInline(`
declare const mystery: Record<string, never>;
export const Widget = define()('x-widget', {
  props: { ...mystery },
  view: () => html\`<p></p>\`,
});
    `);
    expect(analysis.components[0]?.props).toEqual([]);
    expect(analysis.warnings.map((w) => w.message)).toEqual([
      'Skipping an unresolvable spread in spec.props.',
    ]);
  });
});
