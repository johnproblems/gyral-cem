import { describe, expect, it } from 'vitest';
import { analyzeInline } from './helpers.js';

describe('states', () => {
  it('reads custom state keys from an arrow body', () => {
    const analysis = analyzeInline(`
export const Widget = define()('x-widget', {
  view: () => html\`<p></p>\`,
  states: (s: { readonly on: boolean }) => ({ active: s.on, ready: true }),
});
    `);
    expect(analysis.warnings).toEqual([]);
    expect(analysis.components[0]?.cssStates).toEqual(['active', 'ready']);
  });

  it('warns when states are not statically visible', () => {
    const analysis = analyzeInline(`
const compute = (s: unknown) => ({ active: true });
export const Widget = define()('x-widget', {
  view: () => html\`<p></p>\`,
  states: compute,
});
    `);
    expect(analysis.components[0]?.cssStates).toEqual([]);
    expect(analysis.warnings.map((w) => w.message)).toEqual([
      'spec.states does not return an object literal; no custom states recorded.',
    ]);
  });
});

describe('form association', () => {
  it('reads the association shape', () => {
    const analysis = analyzeInline(`
export const Widget = define()('x-widget', {
  view: () => html\`<p></p>\`,
  formAssociated: {
    value: () => '',
    state: () => '',
    validity: () => undefined,
  },
});
    `);
    expect(analysis.components[0]?.form).toEqual({
      associated: true,
      hasValue: true,
      hasState: true,
      hasValidity: true,
    });
  });

  it('reports absent when the spec has no form association', () => {
    const analysis = analyzeInline(`
export const Widget = define()('x-widget', { view: () => html\`<p></p>\` });
    `);
    expect(analysis.components[0]?.form).toEqual({
      associated: false,
      hasValue: false,
      hasState: false,
      hasValidity: false,
    });
  });
});

describe('shadow mode', () => {
  it.each([
    ['omitted', '', 'shadow'],
    ['explicit true', 'shadow: true,', 'shadow'],
    ['light DOM', 'shadow: false,', 'light'],
    ['delegates focus', 'shadow: { delegatesFocus: true },', 'delegates-focus'],
    ['empty object', 'shadow: {},', 'shadow'],
    ['dynamic', 'shadow: ((): boolean => true)(),', 'unknown'],
  ])('reads %s', (_label, field, expected) => {
    const analysis = analyzeInline(`
export const Widget = define()('x-widget', { view: () => html\`<p></p>\`, ${field} });
    `);
    expect(analysis.components[0]?.shadow).toBe(expected);
  });
});
