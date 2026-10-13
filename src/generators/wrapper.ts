// React wrapper: one tiny component per Gyral tag mapping `on<Tag>` props to
// `gyral-output` messages by `_tag`. The listener sits on the element itself
// because `gyral-output` is `composed: false`.
import type { ComponentIR } from '../ir.js';
import { toClassName } from '../manifest.js';
import { HEADER, callbackName } from './shared.js';

export function wrapperFileName(component: ComponentIR): string {
  return `${toClassName(component.tag)}.tsx`;
}

export function componentName(component: ComponentIR): string {
  return component.exportName ?? toClassName(component.tag);
}

export function generateReactWrapper(component: ComponentIR): string {
  const name = componentName(component);
  const propsType = `${name}Props`;
  const attrProps = component.props
    .filter((prop) => prop.attribute !== undefined)
    .map((prop) => `  '${prop.attribute as string}'${prop.required ? '' : '?'}: ${prop.typeText};`);
  const valueProps = component.props
    .filter((prop) => prop.attribute === undefined)
    .map((prop) => `  ${prop.name}${prop.required ? '' : '?'}: ${prop.typeText};`);
  const callbacks = component.outputs.map(
    (output) => `  ${callbackName(output)}?: (msg: ${output.payloadText}) => void;`,
  );
  const destructured = component.outputs.map(callbackName);
  const cases = component.outputs
    .map(
      (output) =>
        `        if (detail._tag === '${output.tag}') callbacksRef.current.${callbackName(output)}?.(detail as ${output.payloadText});`,
    )
    .join('\n');
  return (
    HEADER +
    `import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';\n\n` +
    `export interface ${propsType} extends React.HTMLAttributes<HTMLElement> {\n` +
    `  part?: string;\n` +
    [...attrProps, ...valueProps, ...callbacks].join('\n') +
    `\n}\n\n` +
    `/**\n` +
    ` * Typed wrapper for <${component.tag}>. Props pass through to the element;\n` +
    ` * ${destructured.length > 0 ? destructured.join(', ') : 'no outputs'} listen to \`gyral-output\` filtered by \`_tag\`.\n` +
    ` */\n` +
    `export const ${name} = forwardRef<HTMLElement, ${propsType}>(function ${name}(props, ref) {\n` +
    `  const { ${[...destructured, 'children'].join(', ')}, ...rest } = props;\n` +
    `  const innerRef = useRef<HTMLElement | null>(null);\n` +
    `  useImperativeHandle(ref, () => innerRef.current as HTMLElement);\n` +
    `  const callbacksRef = useRef({ ${destructured.join(', ')} });\n` +
    `  callbacksRef.current = { ${destructured.join(', ')} };\n` +
    `  useEffect(() => {\n` +
    `    const el = innerRef.current;\n` +
    `    if (el === null) return;\n` +
    `    const onOutput = (event: Event): void => {\n` +
    `      const detail = (event as CustomEvent).detail as { readonly _tag?: unknown } | undefined;\n` +
    `      if (detail === undefined || detail === null) return;\n${cases}\n` +
    `    };\n` +
    `    el.addEventListener('gyral-output', onOutput);\n` +
    `    return () => {\n` +
    `      el.removeEventListener('gyral-output', onOutput);\n` +
    `    };\n` +
    `  }, []);\n` +
    `  return React.createElement('${component.tag}', { ...rest, ref: innerRef }, children);\n` +
    `});\n` +
    `${name}.displayName = '${name}';\n`
  );
}

/** Barrel re-exporting every wrapper and its props type. */
export function generateWrapperIndex(components: readonly ComponentIR[]): string {
  const lines = components.flatMap((component) => {
    const name = componentName(component);
    const module = `./${wrapperFileName(component).replace(/\.tsx$/, '.js')}`;
    return [
      `export { ${name} } from '${module}';`,
      `export type { ${name}Props } from '${module}';`,
    ];
  });
  return `${HEADER}\n${lines.join('\n')}\n`;
}
