import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateAstroTypings } from '../src/generators/astro.js';
import { buildCustomData, generateCustomData } from '../src/generators/custom-data.js';
import { generateElementsTypings } from '../src/generators/elements.js';
import { generateReactTypings } from '../src/generators/react.js';
import { generateSvelteTypings } from '../src/generators/svelte.js';
import { generateVueTypings } from '../src/generators/vue.js';
import { generateReactWrapper, generateWrapperIndex } from '../src/generators/wrapper.js';
import { analyzeExamples } from './helpers.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const components = () => analyzeExamples().components;

describe('framework generators', () => {
  it('snapshots react.d.ts', () => {
    expect(generateReactTypings(components())).toMatchSnapshot();
  });

  it('snapshots vue.d.ts', () => {
    expect(generateVueTypings(components())).toMatchSnapshot();
  });

  it('snapshots svelte.d.ts', () => {
    expect(generateSvelteTypings(components())).toMatchSnapshot();
  });

  it('snapshots astro.d.ts', () => {
    expect(generateAstroTypings(components())).toMatchSnapshot();
  });

  it('snapshots elements.d.ts and html-custom-data.json', () => {
    const all = components();
    expect(generateElementsTypings(all, join(root, 'dist', 'typings', 'elements.d.ts'))).toMatchSnapshot();
    expect(generateCustomData(all)).toMatchSnapshot();
  });

  it('snapshots the wrapper barrel', () => {
    expect(generateWrapperIndex(components())).toMatchSnapshot();
  });

  it('snapshots the React wrapper per component', () => {
    for (const component of components()) {
      expect(generateReactWrapper(component)).toMatchSnapshot(component.tag);
    }
  });

  it('emits per-output callbacks and the raw gyral-output listener', () => {
    const typings = generateReactTypings(components());
    expect(typings).toContain('onAddedToCart?: (msg: {');
    expect(typings).toContain(`'ongyral-output'?: (event: CustomEvent<`);
  });

  it('keeps the wrapper listener on the element itself', () => {
    const card = components().find((c) => c.tag === 'product-card');
    expect(card).toBeDefined();
    const wrapper = generateReactWrapper(card as NonNullable<typeof card>);
    expect(wrapper).toContain(`addEventListener('gyral-output', onOutput)`);
    expect(wrapper).toContain(`detail._tag === 'AddedToCart'`);
    expect(wrapper).toContain(`.displayName = `);
    expect(wrapper).toContain(`part?: string;`);
  });

  it('maps tags to modules in elements.d.ts', () => {
    const typings = generateElementsTypings(components(), join(root, 'dist', 'typings', 'elements.d.ts'));
    expect(typings).toContain('interface HTMLElementTagNameMap');
    expect(typings).toContain(`"product-card": InstanceType<typeof import(`);
    expect(typings).toContain('.ProductCard>');
    expect(typings).toContain(`export type GyralCemTags = `);
  });

  it('builds VS Code custom data with tags and attributes', () => {
    const data = buildCustomData(components());
    expect(data.version).toBe(1.1);
    const card = data.tags.find((t) => t.name === 'product-card');
    expect(card?.attributes.map((a) => a.name)).toEqual([
      'sku',
      'max-quantity',
      'featured',
      'tags',
      'card-title',
    ]);
    expect(card?.attributes[0]?.description).toContain('Stock-keeping unit');
  });

  it('shares the tag union and DOM reference across typings', () => {
    const all = components();
    for (const typings of [
      generateReactTypings(all),
      generateVueTypings(all),
      generateSvelteTypings(all),
      generateAstroTypings(all),
    ]) {
      expect(typings).toContain('/// <reference lib="dom" />');
      expect(typings).toContain('GyralCemTags');
    }
    expect(generateVueTypings(all)).toContain('isCustomElement');
  });
});
