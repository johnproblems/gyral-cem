// Astro typings: `astroHTML.JSX` augmentation mapping each tag to its
// attributes and `gyral-output` handlers. Verified against the published
// `astro-jsx.d.ts`: `IntrinsicElements` is an interface, so our members merge
// with it, and named members win over its `[name: string]` fallback for
// arbitrary elements.
import type { ComponentIR } from '../ir.js';
import {
  HEADER,
  attributeEntries,
  eventEntries,
  propertyEntries,
  tagsUnion,
} from './shared.js';

export function generateAstroTypings(components: readonly ComponentIR[]): string {
  const entries = components
    .map((component) => {
      const lines = [
        ...attributeEntries(component),
        ...propertyEntries(component),
        ...eventEntries(component, (payload) => `CustomEvent<${payload}>`),
      ];
      const body = lines.length === 0 ? 'Record<string, never>' : `{\n${lines.join('\n')}\n    }`;
      return `    '${component.tag}': astroHTML.JSX.HTMLAttributes & ${body};`;
    })
    .join('\n');
  return (
    HEADER +
    `declare namespace astroHTML.JSX {\n  type GyralCemTags = ${tagsUnion(components)};\n\n  interface IntrinsicElements {\n${entries}\n  }\n}\n`
  );
}
