import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../src/analyze.js';
import {
  ALL_FRAMEWORKS,
  generateFiles,
  gyralCemPlugin,
  typingsFor,
} from '../src/vite.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('vite plugin', () => {
  it('exposes every framework by default', () => {
    expect([...ALL_FRAMEWORKS].sort()).toEqual([
      'astro',
      'elements',
      'react',
      'svelte',
      'vscode',
      'vue',
      'wrapper',
    ]);
  });

  it('generates the manifest plus one file per framework', () => {
    const analysis = analyze({ root, dirs: ['examples/counter'] });
    const files = generateFiles(analysis, root, {
      dirs: ['examples/counter'],
      out: 'custom-elements.json',
      typingsDir: 'dist/typings',
    });
    const names = files.map((f) => f.path.slice(root.length + 1)).sort();
    expect(names).toEqual([
      'custom-elements.json',
      'dist/typings/XCounter.tsx',
      'dist/typings/astro.d.ts',
      'dist/typings/elements.d.ts',
      'dist/typings/html-custom-data.json',
      'dist/typings/index.ts',
      'dist/typings/react.d.ts',
      'dist/typings/svelte.d.ts',
      'dist/typings/vue.d.ts',
    ]);
    expect(files[0]?.content).toContain('"schemaVersion": "2.1.0"');
  });

  it('honors the frameworks filter', () => {
    const analysis = analyze({ root, dirs: ['examples/counter'] });
    const files = generateFiles(analysis, root, { frameworks: ['vue'] });
    expect(files.map((f) => f.path.slice(root.length + 1)).sort()).toEqual([
      'custom-elements.json',
      'dist/typings/vue.d.ts',
    ]);
  });

  it('analyzes from disk in one call', () => {
    const files = typingsFor(root, { dirs: ['examples/form-input'] });
    expect(files.length).toBeGreaterThan(1);
    expect(files[0]?.path).toBe(join(root, 'custom-elements.json'));
  });

  it('returns a plugin that regenerates beside the Gyral preset', () => {
    const plugin = gyralCemPlugin({ dirs: ['src'] }) as {
      name: string;
      buildStart?: unknown;
      watchChange?: unknown;
      configureServer?: unknown;
    };
    expect(plugin.name).toBe('gyral:cem');
    expect(typeof plugin.buildStart).toBe('function');
    expect(typeof plugin.watchChange).toBe('function');
    expect(typeof plugin.configureServer).toBe('function');
  });
});
