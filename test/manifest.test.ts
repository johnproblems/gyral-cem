import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../src/analyze.js';
import { buildManifest } from '../src/manifest.js';
import { formatErrors, validateManifest } from '../src/validate.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function manifestFor(example: string) {
  const analysis = analyze({ root, dirs: [`examples/${example}`] });
  return { analysis, manifest: buildManifest(analysis.components, root) };
}

describe('manifest snapshots', () => {
  it.each(['counter', 'product-card', 'form-input'])('snapshots %s', (example) => {
    const { manifest } = manifestFor(example);
    expect(manifest).toMatchSnapshot();
  });

  it.each(['counter', 'product-card', 'form-input'])('validates %s against the CEM schema', (example) => {
    const { manifest } = manifestFor(example);
    const { valid, errors } = validateManifest(manifest);
    expect(formatErrors(errors)).toBe('');
    expect(valid).toBe(true);
  });

  it('emits schemaVersion 2.1.0 with one module per source file', () => {
    const { manifest } = manifestFor('product-card');
    expect(manifest.schemaVersion).toBe('2.1.0');
    expect(manifest.modules.map((m) => m.path)).toEqual(['examples/product-card/product-card.ts']);
  });

  it('emits one umbrella gyral-output event with the detail union', () => {
    const { manifest } = manifestFor('product-card');
    const events = manifest.modules[0]?.declarations?.[0]?.events ?? [];
    expect(events.map((e) => e.name)).toEqual(['gyral-output']);
    expect(events[0]?.type.text).toContain('|');
    expect(events[0]?.description).toContain(`detail._tag one of: 'AddedToCart', 'Removed', 'Picked'`);
    expect(events[0]?.description).toContain('adds this product to the cart');
  });

  it('carries JSDoc summaries, deprecations, and css defaults', () => {
    const { manifest } = manifestFor('form-input');
    const declaration = manifest.modules[0]?.declarations?.[0];
    expect(declaration?.description).toContain('form-associated text field');
    const schema = declaration?.members?.find((m) => m.name === 'schema');
    expect(schema?.deprecated).toBe('Pass validation rules through the form instead.');

    const counter = manifestFor('counter').manifest.modules[0]?.declarations?.[0];
    expect(counter?.cssProperties).toEqual([{ name: '--counter-color', default: 'currentColor' }]);
  });

  it('rejects a manifest that violates the schema', () => {
    const { valid, errors } = validateManifest({ schemaVersion: '2.1.0', modules: [{ kind: 'nope' }] });
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });
});
