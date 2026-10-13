// Form association extraction: the presence and shape of `spec.formAssociated`
// (`value`, optional `state` and `validity` projections).
import ts from 'typescript';
import type { FormIR } from '../ir.js';
import { specProperty } from './util.js';

const ABSENT: FormIR = { associated: false, hasValue: false, hasState: false, hasValidity: false };

export function extractForm(spec: ts.ObjectLiteralExpression): FormIR {
  const form = specProperty(spec, 'formAssociated');
  if (form === undefined) return ABSENT;
  if (!ts.isObjectLiteralExpression(form)) {
    // An imported or computed association: associated, shape unknown.
    return { associated: true, hasValue: false, hasState: false, hasValidity: false };
  }
  const keys = new Set<string>();
  for (const member of form.properties) {
    if (ts.isPropertyAssignment(member) && ts.isIdentifier(member.name)) keys.add(member.name.text);
    if (ts.isShorthandPropertyAssignment(member)) keys.add(member.name.text);
    if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) keys.add(member.name.text);
  }
  return {
    associated: true,
    hasValue: keys.has('value'),
    hasState: keys.has('state'),
    hasValidity: keys.has('validity'),
  };
}
