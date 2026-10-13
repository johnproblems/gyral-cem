// Manifest builder: ComponentIR → Custom Elements Manifest 2.1 `Package`.
// Field mapping (see README): tag/class from `define`, props from `spec.props`,
// one `gyral-output` event entry per output `_tag`, slots/parts/css from templates,
// custom states from `states`, form association from `spec.formAssociated`.
import { relative, sep } from 'node:path';
import type { ComponentIR } from './ir.js';

export const SCHEMA_VERSION = '2.1.0';
export const OUTPUT_EVENT = 'gyral-output';

// Minimal structural types for the CEM JSON we emit (schema 2.1).
export interface CemType {
  readonly text: string;
}
export interface CemAttribute {
  readonly name: string;
  readonly fieldName?: string;
  readonly description?: string;
  readonly summary?: string;
  readonly type?: CemType;
  readonly default?: string;
  readonly deprecated?: boolean | string;
}
export interface CemMember {
  readonly kind: 'field' | 'method';
  readonly name: string;
  readonly description?: string;
  readonly summary?: string;
  readonly type?: CemType;
  readonly default?: string;
  readonly attribute?: string;
  readonly reflects?: boolean;
  readonly deprecated?: boolean | string;
}
export interface CemEvent {
  readonly name: string;
  readonly description?: string;
  readonly type: CemType;
}
export interface CemSlot {
  readonly name: string;
  readonly description?: string;
}
export interface CemCssPart {
  readonly name: string;
  readonly description?: string;
}
export interface CemCssProperty {
  readonly name: string;
  readonly description?: string;
  readonly default?: string;
  readonly type?: string;
}
export interface CemCssState {
  readonly name: string;
  readonly description?: string;
}
export interface CemDeclaration {
  readonly kind: 'class';
  readonly name: string;
  readonly description?: string;
  readonly summary?: string;
  readonly deprecated?: boolean | string;
  readonly tagName?: string;
  readonly customElement?: true;
  readonly superclass?: { readonly name: string };
  readonly members?: readonly CemMember[];
  readonly attributes?: readonly CemAttribute[];
  readonly events?: readonly CemEvent[];
  readonly slots?: readonly CemSlot[];
  readonly cssParts?: readonly CemCssPart[];
  readonly cssProperties?: readonly CemCssProperty[];
  readonly cssStates?: readonly CemCssState[];
}
export interface CemExport {
  readonly kind: 'js' | 'custom-element-definition';
  readonly name: string;
  readonly declaration: { readonly name: string; readonly module: string };
}
export interface CemModule {
  readonly kind: 'javascript-module';
  readonly path: string;
  readonly declarations?: readonly CemDeclaration[];
  readonly exports?: readonly CemExport[];
}
export interface CemPackage {
  readonly schemaVersion: string;
  readonly readme?: string;
  readonly modules: readonly CemModule[];
}

const toAttributeValue = (typeText: string): string => typeText;

function shadowNote(component: ComponentIR): string {
  if (component.shadow === 'light') return ' Renders to light DOM (shadow: false).';
  if (component.shadow === 'delegates-focus') return ' Shadow DOM with delegatesFocus.';
  return '';
}

function declarationOf(component: ComponentIR): CemDeclaration {
  const className =
    component.exportName !== undefined && component.exportName !== 'default'
      ? component.exportName
      : toClassName(component.tag);
  const members: CemMember[] = component.props.map((prop) => ({
    kind: 'field',
    name: prop.name,
    description:
      prop.description ?? prop.summary ?? `${prop.builder} prop${prop.required ? ' (required)' : ''}.`,
    ...(prop.summary !== undefined && prop.description !== undefined
      ? { summary: prop.summary }
      : {}),
    type: { text: propTypeText(prop.typeText, prop.required, prop.defaultText !== undefined) },
    ...(prop.defaultText !== undefined ? { default: prop.defaultText } : {}),
    ...(prop.attribute !== undefined ? { attribute: prop.attribute } : {}),
    reflects: prop.reflects,
    ...(prop.deprecated !== undefined ? { deprecated: prop.deprecated } : {}),
  }));
  if (component.form.associated) {
    members.push({
      kind: 'field',
      name: 'formAssociated',
      description: 'Native form participation (spec.formAssociated).',
      type: { text: 'true' },
      default: 'true',
    });
  }
  const declaration: CemDeclaration = {
    kind: 'class',
    name: className,
    description:
      component.description ??
      component.summary ??
      `<${component.tag}> — Gyral component.${shadowNote(component)}`,
    ...(component.summary !== undefined && component.description !== undefined
      ? { summary: component.summary }
      : {}),
    ...(component.deprecated !== undefined ? { deprecated: component.deprecated } : {}),
    tagName: component.tag,
    customElement: true,
    superclass: { name: 'HTMLElement' },
  };
  return {
    ...declaration,
    ...(members.length > 0 ? { members } : {}),
    ...(attributesOf(component).length > 0 ? { attributes: attributesOf(component) } : {}),
    ...(eventsOf(component).length > 0 ? { events: eventsOf(component) } : {}),
    ...(component.slots.length > 0
      ? {
          slots: component.slots.map((slot) => ({
            name: slot.name,
            description: slot.name === '' ? 'Default slot.' : `Slot "${slot.name}".`,
          })),
        }
      : {}),
    ...(component.parts.length > 0
      ? { cssParts: component.parts.map((name) => ({ name })) }
      : {}),
    ...(component.cssProperties.length > 0
      ? {
          cssProperties: component.cssProperties.map((prop) => ({
            name: prop.name,
            ...(prop.default !== undefined ? { default: prop.default } : {}),
          })),
        }
      : {}),
    ...(component.cssStates.length > 0
      ? { cssStates: component.cssStates.map((name) => ({ name })) }
      : {}),
  };
}

function attributesOf(component: ComponentIR): CemAttribute[] {
  return component.props.flatMap((prop) =>
    prop.attribute === undefined
      ? []
      : [
          {
            name: prop.attribute,
            fieldName: prop.name,
            description:
              prop.description ?? prop.summary ?? `${prop.builder} prop "${prop.name}".`,
            ...(prop.summary !== undefined && prop.description !== undefined
              ? { summary: prop.summary }
              : {}),
            type: { text: toAttributeValue(prop.typeText) },
            ...(prop.defaultText !== undefined ? { default: prop.defaultText } : {}),
            ...(prop.deprecated !== undefined ? { deprecated: prop.deprecated } : {}),
          },
        ],
  );
}

function eventsOf(component: ComponentIR): CemEvent[] {
  if (component.outputs.length === 0) return [];
  // The runtime event is the single `gyral-output` (bubbles, not composed), so
  // the manifest carries one entry with the detail union: consumers such as
  // Storybook actions subscribe to the real event name. Per-`_tag` detail is
  // preserved in the description. CEM has no `detail` field, so the payload
  // goes in `type.text` (required by the schema).
  const detail = component.outputs.map((output) => output.payloadText).join(' | ');
  const tags = component.outputs.map((output) => `'${output.tag}'`).join(', ');
  const documented = component.outputs
    .filter((output) => output.description !== undefined)
    .map((output) => `\n- ${output.tag}: ${output.description as string}`);
  const shape =
    component.outputs.length === 1
      ? `detail._tag === ${tags}`
      : `detail._tag one of: ${tags}`;
  return [
    {
      name: OUTPUT_EVENT,
      description: `\`${OUTPUT_EVENT}\` with ${shape} (bubbles, composed: false).${documented.join('')}`,
      type: { text: `CustomEvent<${detail}>` },
    },
  ];
}

/** Display type: optional props include `undefined` (Gyral's honesty rule). */
function propTypeText(typeText: string, required: boolean, hasDefault: boolean): string {
  if (required || hasDefault) return typeText;
  return typeText.includes('|') ? `(${typeText}) | undefined` : `${typeText} | undefined`;
}

export function toClassName(tag: string): string {
  return tag
    .split('-')
    .map((part) => (part.length === 0 ? '' : part[0]?.toUpperCase() + part.slice(1)))
    .join('');
}

export function buildManifest(
  components: readonly ComponentIR[],
  root: string,
): CemPackage {
  const modules = new Map<string, ComponentIR[]>();
  for (const component of components) {
    const path = relative(root, component.file).split(sep).join('/');
    const group = modules.get(path) ?? [];
    group.push(component);
    modules.set(path, group);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    modules: [...modules.entries()].map(([path, group]) => ({
      kind: 'javascript-module',
      path,
      declarations: group.map((component) => declarationOf(component)),
      exports: group.flatMap((component): CemExport[] => {
        const className =
          component.exportName !== undefined && component.exportName !== 'default'
            ? component.exportName
            : toClassName(component.tag);
        const out: CemExport[] = [
          {
            kind: 'custom-element-definition',
            name: component.tag,
            declaration: { name: className, module: path },
          },
        ];
        if (component.exportName !== undefined) {
          out.unshift({
            kind: 'js',
            name: component.exportName,
            declaration: { name: component.exportName, module: path },
          });
        }
        return out;
      }),
    })),
  };
}
