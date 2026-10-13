// Shadow mode extraction: `spec.shadow` is `true` (the default) for a shadow
// root, `false` for light DOM, or an object (`{ delegatesFocus: true }`).
import ts from 'typescript';
import type { ShadowMode } from '../ir.js';
import { specProperty } from './util.js';

export function extractShadow(spec: ts.ObjectLiteralExpression): ShadowMode {
  const shadow = specProperty(spec, 'shadow');
  if (shadow === undefined) return 'shadow';
  if (shadow.kind === ts.SyntaxKind.FalseKeyword) return 'light';
  if (shadow.kind === ts.SyntaxKind.TrueKeyword) return 'shadow';
  if (ts.isObjectLiteralExpression(shadow)) {
    for (const member of shadow.properties) {
      if (
        ts.isPropertyAssignment(member) &&
        ts.isIdentifier(member.name) &&
        member.name.text === 'delegatesFocus' &&
        member.initializer.kind === ts.SyntaxKind.TrueKeyword
      ) {
        return 'delegates-focus';
      }
    }
    return 'shadow';
  }
  return 'unknown';
}
