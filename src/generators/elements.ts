// `elements.d.ts`: an `HTMLElementTagNameMap` entry per exported component, in
// the same shape Gyral's own `.gyral/elements.d.ts` uses — but resolved from
// the typed AST instead of a regex, so it never drifts from the sources.
import { dirname, relative, sep } from 'node:path';
import type { ComponentIR } from '../ir.js';
import { HEADER, tagsUnion } from './shared.js';

/** The import specifier for `file` from `outFile`: relative, `.js` for TS sources. */
function specifier(outFile: string, file: string): string {
  const fromDir = relative(dirname(outFile), file).split(sep).join('/');
  const js = fromDir.replace(/\.tsx?$/, '.js').replace(/\.mts$/, '.mjs');
  return js.startsWith('.') ? js : `./${js}`;
}

export function generateElementsTypings(
  components: readonly ComponentIR[],
  typingsFile: string,
): string {
  const lines = components.flatMap((component) =>
    component.exportName === undefined || component.exportName === 'default'
      ? []
      : [
          `    ${JSON.stringify(component.tag)}: InstanceType<typeof import(${JSON.stringify(specifier(typingsFile, component.file))}).${component.exportName}>;`,
        ],
  );
  return (
    HEADER +
    'export {};\n\n' +
    `export type GyralCemTags = ${tagsUnion(components)};\n\n` +
    'declare global {\n' +
    '  interface HTMLElementTagNameMap {\n' +
    (lines.length === 0 ? '' : `${lines.join('\n')}\n`) +
    '  }\n' +
    '}\n'
  );
}
