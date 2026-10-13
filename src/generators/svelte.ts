// Svelte 5 typings: `svelte/elements` augmentation mapping each tag to its
// attributes, property-only props, and `gyral-output` handlers.
import type { ComponentIR } from '../ir.js';
import {
  HEADER,
  attributeEntries,
  eventEntries,
  propertyEntries,
  tagsUnion,
} from './shared.js';

export function generateSvelteTypings(components: readonly ComponentIR[]): string {
  const entries = components
    .map((component) => {
      const lines = [
        ...attributeEntries(component),
        ...propertyEntries(component),
        ...eventEntries(component, (payload) => `CustomEvent<${payload}>`),
        `      children?: Snippet;`,
      ];
      return `    '${component.tag}': HTMLAttributes<HTMLElement> & {\n${lines.join('\n')}\n    };`;
    })
    .join('\n');
  return (
    HEADER +
    `import type { HTMLAttributes } from 'svelte/elements';\nimport type { Snippet } from 'svelte';\n\nexport type GyralCemTags = ${tagsUnion(components)};\n\ndeclare module 'svelte/elements' {\n  interface SvelteHTMLElements {\n${entries}\n  }\n}\n`
  );
}
