import { describe, expect, it } from 'vitest';
import { recordedSpecs } from '../examples/gyral-stub.js';
import '../examples/counter/counter.js';
import '../examples/product-card/product-card.js';
import '../examples/form-input/form-input.js';
import { diffRecordedSpecs, summarizeMismatches, type RecordedSpec } from '../src/runtime-check.js';
import { analyzeExamples } from './helpers.js';

describe('runtime cross-check', () => {
  it('agrees with the static analysis for every example', () => {
    const components = analyzeExamples().components;
    const recorded = new Map<string, RecordedSpec>(
      [...recordedSpecs()].map(([tag, spec]) => [tag, spec as unknown as RecordedSpec]),
    );
    expect(diffRecordedSpecs(recorded, components)).toEqual([]);
  });

  it('reports static/dynamic mismatches instead of silently passing', () => {
    const components = analyzeExamples().components;
    const recorded = new Map<string, RecordedSpec>([
      ['product-card', { props: { sku: { kind: 'number', attribute: 'sku', required: true } } }],
      ['x-missing', { props: {} }],
    ]);
    const messages = diffRecordedSpecs(recorded, components).map((m) => `${m.tag}: ${m.message}`);
    expect(messages).toContain(
      'product-card: Prop "sku": static builder "string" != runtime "number".',
    );
    expect(messages).toContain('x-missing: Recorded at runtime but missed by static discovery.');
    expect(messages).toContain(
      'form-input: Found statically but never recorded at runtime.',
    );
  });

  it('honors ignore lists and summarizes mismatches', () => {
    const components = analyzeExamples().components;
    const recorded = new Map<string, RecordedSpec>([
      ['product-card', { props: { sku: { kind: 'number', attribute: 'sku', required: true } } }],
      ['x-missing', { props: {} }],
    ]);
    const filtered = diffRecordedSpecs(recorded, components, {
      ignoreTags: ['x-missing', 'form-input', 'x-counter'],
      ignoreProps: { 'product-card': ['sku'] },
    });
    expect(filtered.map((m) => m.message)).toContain(
      'Prop "maxQuantity" found statically but not recorded at runtime.',
    );
    expect(summarizeMismatches(filtered)).toEqual(
      filtered.map((m) => `${m.tag}: ${m.message}`),
    );
    const empty = diffRecordedSpecs(recorded, components, {
      ignoreTags: ['product-card', 'x-missing', 'form-input', 'x-counter'],
    });
    expect(empty).toEqual([]);
  });
});
