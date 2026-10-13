import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateAstroTypings } from '../src/generators/astro.js';
import { generateReactTypings } from '../src/generators/react.js';
import { generateReactWrapper } from '../src/generators/wrapper.js';
import { generateSvelteTypings } from '../src/generators/svelte.js';
import { generateVueTypings } from '../src/generators/vue.js';
import { analyzeExamples } from './helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const TSC = join(here, '..', 'node_modules', 'typescript', 'bin', 'tsc');

/**
 * Minimal `react`/`react/jsx-runtime` surface: enough for the generated
 * typings and wrapper to compile, nothing more.
 */
const REACT_SHIM = `
declare module 'react' {
  namespace React {
    interface HTMLAttributes<T> {
      children?: unknown;
      className?: string;
    }
    type DetailedHTMLProps<E, T> = E & { ref?: unknown };
    function forwardRef<T, P>(render: (props: P, ref: unknown) => unknown): { (props: P): unknown; displayName?: string };
    function useRef<T>(initial: T): { current: T };
    function useImperativeHandle(ref: unknown, init: () => unknown): void;
    function useEffect(effect: () => void | (() => void), deps: readonly unknown[]): void;
    function createElement(...args: any[]): unknown;
  }
  export = React;
}
declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      [elem: string]: any;
    }
  }
  export function jsx(...args: any[]): unknown;
  export function jsxs(...args: any[]): unknown;
  export const Fragment: unknown;
}
`;

const USAGE = `
const track = (sku: string): void => {
  void sku;
};

// Typed attributes, per-output callbacks, and raw listeners — no any, no DOM APIs.
const els = (
  <>
    <product-card sku="A12" onAddedToCart={(msg) => track(msg.sku)} />
    <product-card sku="B34" max-quantity={2} onPicked={(msg) => track(msg.sku)} />
    <x-counter label="n" onCountChanged={(msg) => track(String(msg.count))} />
  </>
);
void els;

// @ts-expect-error sku is a required string, not a number.
const badAttr = <product-card sku={123} />;
// @ts-expect-error payloads carry sku, not nope.
const badPayload = <product-card sku="A" onAddedToCart={(msg) => track(msg.nope)} />;
void badAttr;
void badPayload;
`;

/**
 * The load-bearing shape of Astro's published `astro-jsx.d.ts`: an interface
 * with a `[name: string]` fallback for arbitrary elements.
 */
const ASTRO_SHIM = `
declare namespace astroHTML.JSX {
  interface HTMLAttributes {
    class?: string;
  }
  interface DefinedIntrinsicElements {
    div: HTMLAttributes;
  }
  interface IntrinsicElements extends DefinedIntrinsicElements {
    [name: string]: { [name: string]: any };
  }
}
`;

const ASTRO_USAGE = `
type Card = astroHTML.JSX.IntrinsicElements['product-card'];
const good: Card = { sku: 'A12' };
// @ts-expect-error sku must be a string, not a number.
const bad: Card = { sku: 123 };
void good;
void bad;
`;

/** Minimal `vue` surface: `DefineComponent` capturing props and emits. */
const VUE_SHIM = `
declare module 'vue' {
  export type DefineComponent<
    P = {},
    B = {},
    D = {},
    C = {},
    M = {},
    X = {},
    Y = {},
    E = {},
  > = {
    __props?: P;
    __emits?: E;
  };
  export interface GlobalComponents {}
}
`;

const VUE_USAGE = `
type Card = import('vue').GlobalComponents['product-card'];
type Props = NonNullable<Card['__props']>;
const good: Props = { sku: 'A12' };
// @ts-expect-error sku must be a string, not a number.
const bad: Props = { sku: 123 };
type Emits = NonNullable<Card['__emits']>;
type Detail = Emits['gyral-output'] extends [detail: infer D] ? D : never;
const detail: Detail = { _tag: 'Picked', sku: 'A' };
// @ts-expect-error detail needs a known _tag.
const badDetail: Detail = { _tag: 'Nope', sku: 'A' };
void good;
void bad;
void detail;
void badDetail;
`;

/** Minimal `svelte` + `svelte/elements` surface. */
const SVELTE_SHIM = `
declare module 'svelte/elements' {
  export interface HTMLAttributes<T> {
    class?: string;
  }
  export interface SvelteHTMLElements {}
}
declare module 'svelte' {
  export type Snippet = (...args: never[]) => unknown;
}
`;

const SVELTE_USAGE = `
type Card = import('svelte/elements').SvelteHTMLElements['product-card'];
const good: Card = { sku: 'A12', onAddedToCart: (msg) => msg.sku };
// @ts-expect-error sku must be a string, not a number.
const bad: Card = { sku: 123 };
// @ts-expect-error payloads carry sku, not nope.
const badCb: Card = { onAddedToCart: (msg) => msg.nope };
void good;
void bad;
void badCb;
`;

function typecheck(
  files: Record<string, string>,
  lib?: readonly string[],
): { ok: boolean; output: string } {
  const dir = mkdtempSync(join(tmpdir(), 'gyral-cem-ts-'));
  for (const [name, source] of Object.entries(files)) {
    writeFileSync(join(dir, name), source);
  }
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        types: [],
        ...(lib !== undefined ? { lib } : {}),
      },
      include: ['*.tsx', '*.ts'],
    }),
  );
  try {
    const output = execFileSync(process.execPath, [TSC, '-p', join(dir, 'tsconfig.json')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, output };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${err.stdout ?? ''}\n${err.stderr ?? ''}` };
  }
}

describe('generated typings typecheck', () => {
  it('compiles react.d.ts and checks host usage, positive and negative', () => {
    const components = analyzeExamples().components;
    const result = typecheck({
      'react.d.ts': generateReactTypings(components),
      'react-shim.d.ts': REACT_SHIM,
      'usage.tsx': USAGE,
    });
    expect(result.output).toBe('');
    expect(result.ok).toBe(true);
  });

  it('merges astro.d.ts into astroHTML.JSX with named members winning', () => {
    const components = analyzeExamples().components;
    // No DOM lib: the generated `/// <reference lib="dom" />` must provide it.
    const result = typecheck(
      {
        'astro.d.ts': generateAstroTypings(components),
        'astro-shim.d.ts': ASTRO_SHIM,
        'usage.ts': ASTRO_USAGE,
      },
      ['ES2022'],
    );
    expect(result.output).toBe('');
    expect(result.ok).toBe(true);
  });

  it('fills vue GlobalComponents with props and emits', () => {
    const components = analyzeExamples().components;
    const result = typecheck({
      'vue.d.ts': generateVueTypings(components),
      'vue-shim.d.ts': VUE_SHIM,
      'usage.ts': VUE_USAGE,
    });
    expect(result.output).toBe('');
    expect(result.ok).toBe(true);
  });

  it('fills svelte SvelteHTMLElements with attributes and handlers', () => {
    const components = analyzeExamples().components;
    const result = typecheck({
      'svelte.d.ts': generateSvelteTypings(components),
      'svelte-shim.d.ts': SVELTE_SHIM,
      'usage.ts': SVELTE_USAGE,
    });
    expect(result.output).toBe('');
    expect(result.ok).toBe(true);
  });

  it('compiles the React wrapper', () => {
    const components = analyzeExamples().components;
    const card = components.find((c) => c.tag === 'product-card');
    expect(card).toBeDefined();
    if (card === undefined) return;
    const result = typecheck({
      'react-shim.d.ts': REACT_SHIM,
      'ProductCard.tsx': generateReactWrapper(card),
    });
    expect(result.output).toBe('');
    expect(result.ok).toBe(true);
  });
});
