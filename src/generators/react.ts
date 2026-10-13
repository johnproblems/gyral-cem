// React 19 typings: JSX `IntrinsicElements` entries with attributes,
// property-only props, and per-output `on<Tag>` callbacks. React 19 sets
// properties on defined custom elements, so both shapes typecheck.
// The raw listener spelling is load-bearing: React's `setPropOnCustomElement`
// turns any function-valued prop starting with lowercase `on` into
// `addEventListener(prop.slice(2))` with the remainder verbatim, so only the
// exact `ongyral-output` prop listens for `gyral-output`. (An `onAddedToCart`
// passed straight through would listen for an `AddedToCart` event that never
// fires — which is why the wrapper consumes `on<Tag>` itself).
// DEV unknown-prop validation is also skipped for custom elements, so no
// warnings are emitted for these props.
import type { ComponentIR } from '../ir.js';
import {
  HEADER,
  attributeEntries,
  componentInterface,
  eventEntries,
  propertyEntries,
  tagsUnion,
} from './shared.js';

function elementEntry(component: ComponentIR): string {
  const lines = [
    ...attributeEntries(component),
    `      part?: string;`,
    ...propertyEntries(component),
    ...eventEntries(component, (payload) => `CustomEvent<${payload}>`),
  ];
  const body = lines.length === 0 ? 'Record<string, never>' : `{\n${lines.join('\n')}\n    }`;
  // Tags contain hyphens, so the key is always quoted.
  return `      '${component.tag}': React.DetailedHTMLProps<React.HTMLAttributes<${componentInterface(component)}> & ${body}, ${componentInterface(component)}>;`;
}

function elementInterface(component: ComponentIR): string {
  const props = component.props.map((prop) => `  ${prop.name}: ${prop.typeText};`);
  return `export interface ${componentInterface(component)} extends HTMLElement {\n${props.join('\n')}${props.length > 0 ? '\n' : ''}}`;
}

export function generateReactTypings(components: readonly ComponentIR[]): string {
  const interfaces = components.map(elementInterface).join('\n\n');
  const entries = components.map(elementEntry).join('\n');
  // Both `react` (classic `jsx: react`) and `react/jsx-runtime` (automatic)
  // carry the JSX namespace in @types/react; augmenting both covers both.
  return (
    HEADER +
    `import type React from 'react';\n\nexport type GyralCemTags = ${tagsUnion(components)};\n\n${interfaces}\n\ndeclare module 'react' {\n  namespace JSX {\n    interface IntrinsicElements {\n${entries}\n    }\n  }\n}\n\ndeclare module 'react/jsx-runtime' {\n  namespace JSX {\n    interface IntrinsicElements {\n${entries}\n    }\n  }\n}\n\ndeclare global {\n  namespace JSX {\n    interface IntrinsicElements {\n${entries}\n    }\n  }\n}\n`
  );
}
