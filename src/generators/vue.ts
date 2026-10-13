// Vue 3.5 typings: `GlobalComponents` entries typed as `DefineComponent`
// with the component's props and a `gyral-output` emit per output union.
// Vue apps must also set `isCustomElement` (see README); types alone cannot.
import type { ComponentIR } from '../ir.js';
import { toClassName } from '../manifest.js';
import { HEADER, componentInterface, tagsUnion } from './shared.js';

const SETUP_NOTE = `// Setup: tell Vue which tags are custom elements, e.g. in vite.config.ts:
//   vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.includes('-') } } })
`;

function propsInterface(component: ComponentIR): string {
  const lines = component.props.flatMap((prop) => {
    const optional = prop.required ? '' : '?';
    const attr = prop.attribute === undefined ? [] : [`  '${prop.attribute}'${optional}: ${prop.typeText};`];
    const field = prop.attribute === undefined ? [`  ${prop.name}${optional}: ${prop.typeText};`] : [];
    return [...attr, ...field];
  });
  return `export interface ${componentInterface(component)}Props {\n${lines.join('\n')}\n}`;
}

function emitsType(component: ComponentIR): string {
  if (component.outputs.length === 0) return 'Record<string, never>';
  const union = component.outputs.map((o) => o.payloadText).join(' | ');
  return `{ 'gyral-output': [detail: ${union}] }`;
}

export function generateVueTypings(components: readonly ComponentIR[]): string {
  const declarations = components
    .map(
      (component) =>
        `${propsInterface(component)}\n\nexport interface ${componentInterface(component)} extends HTMLElement {\n${component.props.map((prop) => `  ${prop.name}: ${prop.typeText};`).join('\n')}\n}`,
    )
    .join('\n\n');
  const entries = components
    .map(
      (component) =>
        `    '${component.tag}': DefineComponent<${componentInterface(component)}Props, Record<string, never>, Record<string, never>, Record<string, never>, Record<string, never>, Record<string, never>, Record<string, never>, ${emitsType(component)}>;\n` +
        `    '${toClassName(component.tag)}': DefineComponent<${componentInterface(component)}Props, Record<string, never>, Record<string, never>, Record<string, never>, Record<string, never>, Record<string, never>, Record<string, never>, ${emitsType(component)}>;`,
    )
    .join('\n');
  return (
    HEADER +
    SETUP_NOTE +
    `import type { DefineComponent } from 'vue';\n\nexport type GyralCemTags = ${tagsUnion(components)};\n\n${declarations}\n\ndeclare module 'vue' {\n  interface GlobalComponents {\n${entries}\n  }\n}\n`
  );
}
